import { NextResponse } from "next/server";
import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { atenderWhatsapp, vincularLeadWhatsapp } from "@/lib/aliRedes";
import { anotar } from "@/lib/respuestaAutomatica";
import { transcribirAudioWhatsapp, transcripcionActiva } from "@/lib/transcribir";
import {
  WA_PLATFORM,
  describirMensajeWhatsapp,
  psidWhatsapp,
  type WhatsappMensaje,
} from "@/lib/whatsapp";

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

    const nuestro = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const pendientes: { conversationId: string; mensajeId: string; publicacion: string | null }[] = [];
    // Audios que se transcriben antes de que responda Ali (lib/transcribir.ts).
    const audios: { wamid: string; mediaId: string }[] = [];

    for (const entry of body.entry ?? []) {
      for (const cambio of (entry.changes ?? []) as Cambio[]) {
        if (cambio.field !== "messages" || !cambio.value) continue;
        const v = cambio.value;
        // Solo el número de Ali (la cuenta puede tener otros).
        if (nuestro && v.metadata?.phone_number_id && v.metadata.phone_number_id !== nuestro) continue;

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
          const psid = psidWhatsapp(m.from);
          let conv = await prisma.conversation.findUnique({ where: { psid } });
          const nueva = !conv;
          if (!conv) {
            conv = await prisma.conversation.create({ data: { psid, platform: WA_PLATFORM, metaName: nombre } });
          } else if (!conv.metaName && nombre) {
            conv = await prisma.conversation.update({ where: { id: conv.id }, data: { metaName: nombre } });
          }

          // Si llegó desde un anuncio de clic a WhatsApp, queda el anuncio con el mensaje.
          const anuncio = m.referral?.headline || m.referral?.body || null;
          await prisma.message.create({
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

          if (m.type === "audio" && m.audio?.id && transcripcionActiva()) audios.push({ wamid: m.id, mediaId: m.audio.id });
          pendientes.push({ conversationId: conv.id, mensajeId: m.id, publicacion: anuncio });
        }
      }
    }

    if (pendientes.length) {
      setImmediate(async () => {
        for (const a of audios) await transcribirAudioWhatsapp(a.wamid, a.mediaId);
        for (const p of pendientes) await atenderWhatsapp(p.conversationId, p.mensajeId, p.publicacion);
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
