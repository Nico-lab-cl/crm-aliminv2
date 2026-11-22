import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { rutaDelAdjunto } from "@/lib/media";
import { enviarMedioWhatsapp, numeroDePsid, subirMedioWhatsapp, waIdDePsid } from "@/lib/whatsapp";
import { cargarConversacionYAsesor, despuesDeEnviar, respuestaRechazo, revisarVentana } from "@/lib/whatsappCrmWeb";

export const dynamic = "force-dynamic";

/**
 * Foto o PDF propio que un asesor adjunta desde el CRM web a un chat de
 * WhatsApp (multipart: conversationId, advisorId, archivo y leyenda opcional).
 * Se sube a WhatsApp, se manda, y se guarda en MessageMedia para verlo en la
 * bandeja. Solo JPG, PNG y PDF: son los que WhatsApp acepta como foto o documento.
 */

const TIPOS: Record<string, { tipo: "imagen" | "pdf"; kind: "image" | "document"; max: number }> = {
  "image/jpeg": { tipo: "imagen", kind: "image", max: 5 * 1024 * 1024 },
  "image/png": { tipo: "imagen", kind: "image", max: 5 * 1024 * 1024 },
  "application/pdf": { tipo: "pdf", kind: "document", max: 16 * 1024 * 1024 },
};

/** Revisa los primeros bytes: el tipo que declara el navegador se puede mentir. */
function coincideContenido(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  return false;
}

export async function POST(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario inválido" }, { status: 400 });
  }

  const conversationId = String(form.get("conversationId") || "").trim();
  const advisorId = String(form.get("advisorId") || "").trim();
  const leyenda = String(form.get("leyenda") || "").trim().slice(0, 1000);
  const archivo = form.get("archivo");
  if (!conversationId || !advisorId) return NextResponse.json({ error: "Faltan la conversación o el asesor" }, { status: 400 });
  if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "No llegó ningún archivo" }, { status: 400 });

  const mime = (archivo.type || "").toLowerCase().split(";")[0].trim();
  const permitido = TIPOS[mime];
  if (!permitido) return NextResponse.json({ error: "Solo se pueden mandar fotos JPG o PNG y archivos PDF." }, { status: 400 });
  if (archivo.size === 0) return NextResponse.json({ error: "El archivo llegó vacío" }, { status: 400 });
  if (archivo.size > permitido.max) {
    return NextResponse.json({ error: `El archivo supera el límite de ${Math.round(permitido.max / 1024 / 1024)} MB` }, { status: 400 });
  }
  if (!rateLimit(`wa-archivo:${conversationId}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados envíos seguidos" }, { status: 429 });
  }

  try {
    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (bytes.length > permitido.max || !coincideContenido(bytes, mime)) {
      return NextResponse.json({ error: "El contenido del archivo no coincide con su formato" }, { status: 400 });
    }
    const nombre = (archivo.name || (permitido.tipo === "pdf" ? "documento.pdf" : "foto.jpg")).replace(/[\r\n"]/g, "").slice(0, 120);

    const cargado = await cargarConversacionYAsesor(conversationId, advisorId);
    if ("error" in cargado) return cargado.error;
    const { conversation, advisor } = cargado;

    const ventana = await revisarVentana(conversation.id);
    if (ventana) return ventana;

    const desde = numeroDePsid(conversation.psid);
    let wamid: string | null;
    try {
      const mediaId = await subirMedioWhatsapp(bytes, mime, nombre, desde);
      wamid = await enviarMedioWhatsapp(waIdDePsid(conversation.psid), { id: mediaId, tipo: permitido.tipo, nombre, leyenda }, desde);
    } catch (error) {
      return respuestaRechazo(error);
    }

    const texto = leyenda || (permitido.tipo === "pdf" ? `📎 ${nombre}` : "📷 Foto");
    const guardado = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId: conversation.id, text: texto, senderId: advisor.id, senderType: "advisor", sourceType: "DIRECT", sourceId: wamid },
        select: { id: true, createdAt: true },
      });
      const media = await (tx as any).messageMedia.create({
        data: { messageId: message.id, kind: permitido.kind, mimeType: mime, fileName: nombre, sizeBytes: bytes.length, data: bytes },
        select: { id: true },
      });
      // Solo las fotos llevan mediaUrl: un PDF con mediaUrl la bandeja móvil lo pinta como foto rota.
      if (permitido.kind === "image") {
        await tx.message.update({ where: { id: message.id }, data: { mediaUrl: rutaDelAdjunto(media.id) } });
      }
      return { ...message, mediaId: media.id };
    });
    await despuesDeEnviar(conversation, advisor);

    return NextResponse.json({ id: guardado.id, createdAt: guardado.createdAt, mediaId: guardado.mediaId, autor: advisor.name });
  } catch (error) {
    console.error("[whatsapp/archivo] Error mandando el archivo:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
