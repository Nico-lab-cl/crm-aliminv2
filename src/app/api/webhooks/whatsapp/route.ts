import { NextResponse } from "next/server";
import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { atenderWhatsapp, vincularLeadWhatsapp } from "@/lib/aliRedes";
import { anotar } from "@/lib/respuestaAutomatica";
import { transcribirAudioWhatsapp, transcripcionActiva } from "@/lib/transcribir";
import {
  WA_PLATFORM,
  descargarMedioWhatsapp,
  describirMensajeWhatsapp,
  numerosWhatsapp,
  psidWhatsapp,
  type WhatsappMensaje,
} from "@/lib/whatsapp";
import { rutaDelAdjunto } from "@/lib/media";

type MedioCliente = { messageId: string; mediaId: string; kind: "image" | "audio" | "video" | "document"; fileName: string | null };

/** El archivo que trae el mensaje del cliente, si trae uno que se pueda guardar. */
function medioDelMensaje(m: WhatsappMensaje): Omit<MedioCliente, "messageId"> | null {
  if (m.type === "image" && m.image?.id) return { mediaId: m.image.id, kind: "image", fileName: null };
  if (m.type === "audio" && m.audio?.id) return { mediaId: m.audio.id, kind: "audio", fileName: null };
  if (m.type === "video" && m.video?.id) return { mediaId: m.video.id, kind: "video", fileName: null };
  if (m.type === "document" && m.document?.id) return { mediaId: m.document.id, kind: "document", fileName: m.document.filename || null };
  return null;
}

/**
 * Baja el archivo de WhatsApp y lo deja en MessageMedia, para verlo en la
 * bandeja y en el CRM web (decisión de Nicolás, 22-11-2026). Antes solo
 * quedaba el texto "[Imagen]". Nunca lanza.
 */
async function guardarMedioCliente(m: MedioCliente) {
  try {
    const archivo = await descargarMedioWhatsapp(m.mediaId);
    if (!archivo) return;
    const media = await (prisma as any).messageMedia.create({
      data: {
        messageId: m.messageId,
        kind: m.kind,
        mimeType: archivo.mime,
        fileName: m.fileName ? m.fileName.slice(0, 200) : null,
        sizeBytes: archivo.datos.length,
        data: archivo.datos,
      },
      select: { id: true },
    });
    await prisma.message.update({ where: { id: m.messageId }, data: { mediaUrl: rutaDelAdjunto(media.id) } });
  } catch (error) {
    console.error(`[whatsapp] No se pudo guardar el archivo del mensaje ${m.messageId}:`, error);
  }
}

/**
 * Webhook de WhatsApp (Cloud API de Meta). Se configura en la app "Chat redes
 * sociales Alimin" → WhatsApp → Configuración, con la URL
 * https://crm.aliminlomasdelmar.com/api/webhooks/whatsapp y el campo "messages".
 *
 * Guarda cada mensaje del cliente en el CRM (conversación con platform
 * "whatsapp"), vincula o crea el lead con su teléfono (WhatsApp lo trae) y
 * deja que Ali responda (lib/aliRedes.ts). Responde 200 al tiro: Meta
 * reintenta si demora.
 */

const reclamados = new Map<string, number>();
function reclamar(id: string) {
  const ahora = Date.now();
  if (reclamados.size > 5000) reclamados.forEach((t, k) => ahora - t > 600_000 && reclamados.delete(k));
  if (reclamados.has(id)) return false;
  reclamados.set(id, ahora);
  return true;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
  if (esperado && searchParams.get("hub.mode") === "subscribe" && searchParams.get("hub.verify_token") === esperado) {
    console.log("[whatsapp] Webhook verificado ✅");
    return new Response(searchParams.get("hub.challenge"), { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface Cambio {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: { wa_id?: string; profile?: { name?: string } }[];
    messages?: WhatsappMensaje[];
    statuses?: { id?: string; status?: string; recipient_id?: string; errors?: { code?: number; title?: string }[] }[];
  };
}

export async function POST(req: Request) {
  try {
    const crudo = await req.text();
    if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"))) {
      return new Response("Firma inválida", { status: 401 });
    }
    const body = JSON.parse(crudo);
    if (body.object !== "whatsapp_business_account") return new Response("Not Found", { status: 404 });

    const nuestros = numerosWhatsapp();
    const pendientes: { conversationId: string; mensajeId: string; publicacion: string | null; desde: string | null }[] = [];
    // Audios que se transcriben antes de que responda Ali (lib/transcribir.ts).
    const audios: { wamid: string; mediaId: string }[] = [];
    // Fotos, PDF, audios y videos que se guardan para verlos en la bandeja.
    const medios: MedioCliente[] = [];

    for (const entry of body.entry ?? []) {
      for (const cambio of (entry.changes ?? []) as Cambio[]) {
        if (cambio.field !== "messages" || !cambio.value) continue;
        const v = cambio.value;
        // Solo los números que atiende Ali (WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_OTROS_NUMEROS).
        const numeroEmpresa = v.metadata?.phone_number_id || null;
        if (nuestros.length && numeroEmpresa && !nuestros.includes(numeroEmpresa)) continue;

        for (const s of v.statuses ?? []) {
          if (s.status === "failed") {
            console.error(`[whatsapp] Meta no entregó ${s.id}:`, JSON.stringify(s.errors ?? []));
          }
        }

        for (const m of v.messages ?? []) {
          const texto = describirMensajeWhatsapp(m);
          if (!texto || !m.id || !m.from || !reclamar(m.id)) continue;
          if (await prisma.message.findFirst({ where: { sourceId: m.id }, select: { id: true } })) continue;

          const nombre = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name?.trim() || null;
          const psid = psidWhatsapp(m.from, numeroEmpresa);
          let conv = await prisma.conversation.findUnique({ where: { psid } });
          const nueva = !conv;
          if (!conv) {
            conv = await prisma.conversation.create({ data: { psid, platform: WA_PLATFORM, metaName: nombre } });
          } else if (!conv.metaName && nombre) {
            conv = await prisma.conversation.update({ where: { id: conv.id }, data: { metaName: nombre } });
          }

          // Si llegó desde un anuncio de clic a WhatsApp, queda el anuncio con el mensaje.
          const anuncio = m.referral?.headline || m.referral?.body || null;
          const guardado = await prisma.message.create({
            select: { id: true },
            data: {
              conversationId: conv.id,
              text: texto,
              senderType: "meta",
              sourceType: "DIRECT",
              sourceId: m.id,
              postId: m.referral?.source_id || null,
              postContent: m.referral ? JSON.stringify({ text: anuncio, url: m.referral.source_url || null }) : null,
            },
          });
          await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
          if (m.referral) {
            await anotar(conv.id, `📣 Llegó desde un anuncio de Meta${anuncio ? `: "${anuncio.slice(0, 120)}"` : ""}.`);
          }
          if (nueva || !conv.leadId) await vincularLeadWhatsapp(conv.id, m.from, nombre);

          const medio = medioDelMensaje(m);
          if (medio) medios.push({ ...medio, messageId: guardado.id });
          if (m.type === "audio" && m.audio?.id && transcripcionActiva()) audios.push({ wamid: m.id, mediaId: m.audio.id });
          pendientes.push({ conversationId: conv.id, mensajeId: m.id, publicacion: anuncio, desde: numeroEmpresa });
        }
      }
    }

    if (pendientes.length) {
      setImmediate(async () => {
        for (const m of medios) await guardarMedioCliente(m);
        for (const a of audios) await transcribirAudioWhatsapp(a.wamid, a.mediaId);
        for (const p of pendientes) await atenderWhatsapp(p.conversationId, p.mensajeId, p.publicacion, p.desde);
      });
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("[whatsapp] Error en el webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Misma firma que el webhook de IG/FB: es la misma app de Meta (META_APP_SECRET). */
function firmaValida(crudo: string, firma: string | null) {
  const secreto = process.env.META_APP_SECRET;
  if (!secreto) return true;
  if (!firma) return false;
  const esperada = "sha256=" + crypto.createHmac("sha256", secreto).update(crudo, "utf8").digest("hex");
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
