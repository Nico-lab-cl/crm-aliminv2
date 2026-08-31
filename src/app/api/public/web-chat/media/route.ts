import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  WEB_CHAT_PLATFORM,
  WEB_CHAT_SENDER,
  checkWebChatKey,
  notifyAdvisorsOfWebChat,
  rateLimit,
  webChatPsid,
} from "@/lib/web-chat";
import { ErrorDeAdjunto, crearMensajeConAdjunto, textoPorDefecto, validarAdjunto } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * El visitante de aliminspa.cl manda una foto, un audio o un video.
 *
 * Es el equivalente de /api/public/web-chat/message pero con un archivo. Igual
 * que aquel, lo llama el servidor del sitio publico con la API key: el
 * navegador del visitante nunca habla directo con el CRM.
 *
 * El limite de frecuencia es mas estricto que el de los mensajes de texto (6
 * por minuto contra 20) porque aca cada llamada escribe megabytes en la base y
 * no unos cientos de bytes.
 */
export async function POST(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "El envio no es un formulario valido" }, { status: 400 });
  }

  const conversationId = String(form.get("conversationId") || "").trim();
  const sessionId = String(form.get("sessionId") || "").trim();
  const texto = String(form.get("text") || "").trim();
  const duracionRaw = Number(form.get("durationMs") || 0);

  if (!conversationId || !sessionId) {
    return NextResponse.json({ error: "Faltan datos de la conversacion" }, { status: 400 });
  }

  if (!rateLimit(`media:${conversationId}`, 6, 60 * 1000)) {
    return NextResponse.json(
      { error: "Estas enviando archivos muy rapido, espera unos segundos." },
      { status: 429 }
    );
  }

  try {
    const adjunto = await validarAdjunto(form.get("file"));

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, psid: true, platform: true, leadId: true, metaName: true },
    });

    // La sesion del visitante es la que autoriza: sin el sessionId correcto no
    // se puede escribir en una conversacion ajena aunque se conozca su id.
    if (
      !conversation ||
      conversation.platform !== WEB_CHAT_PLATFORM ||
      conversation.psid !== webChatPsid(sessionId)
    ) {
      return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
    }

    const resultado = await crearMensajeConAdjunto({
      conversationId: conversation.id,
      adjunto,
      senderType: WEB_CHAT_SENDER,
      texto,
      durationMs: Number.isFinite(duracionRaw) ? duracionRaw : null,
      fileName: (form.get("file") as File)?.name || null,
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { visitorLastSeenAt: new Date(), visitorNotifiedAt: null },
    });

    if (conversation.leadId) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { lastActivity: "Envio un archivo por el chat web", lastNoteAt: new Date() },
      });
    }

    // A diferencia del texto, un adjunto no se agrupa por rafaga: si el cliente
    // se tomo el trabajo de grabar un audio o sacar una foto, el asesor tiene
    // que enterarse aunque venga escribiendo hace un rato.
    await notifyAdvisorsOfWebChat({
      leadId: conversation.leadId,
      visitorName: conversation.metaName || "Un visitante",
      text: texto || textoPorDefecto(adjunto.kind),
    });

    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof ErrorDeAdjunto) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[web-chat/media] Error guardando el adjunto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
