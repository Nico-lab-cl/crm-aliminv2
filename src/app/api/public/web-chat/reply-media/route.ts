import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { WEB_CHAT_PLATFORM, checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { ErrorDeAdjunto, crearMensajeConAdjunto, validarAdjunto } from "@/lib/media";
import { marcarContactado } from "@/lib/followups";

export const dynamic = "force-dynamic";

/**
 * Adjunto enviado por un asesor desde el CRM de escritorio.
 *
 * Es a /api/public/web-chat/reply lo que /api/messages/media es a
 * /api/messages/send: el mismo camino, pero con un archivo en vez de texto.
 *
 * Igual que reply, aca no hay sesion de NextAuth: el CRM de escritorio se
 * autentica con la API key e indica de parte de que asesor escribe. La razon de
 * fondo es la misma de siempre -- la asignacion del lead y el orden de la
 * bandeja tienen un solo responsable, y es este CRM.
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
  const advisorId = String(form.get("advisorId") || "").trim();
  const texto = String(form.get("text") || "").trim();
  const duracionRaw = Number(form.get("durationMs") || 0);

  if (!conversationId || !advisorId) {
    return NextResponse.json({ error: "Faltan la conversacion o el asesor" }, { status: 400 });
  }

  if (!rateLimit(`reply-media:${conversationId}`, 12, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados envios seguidos" }, { status: 429 });
  }

  try {
    const adjunto = await validarAdjunto(form.get("file"));

    const [conversation, advisor] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          platform: true,
          leadId: true,
          lead: { select: { assignedToId: true } },
        },
      }),
      prisma.user.findUnique({ where: { id: advisorId }, select: { id: true, name: true } }),
    ]);

    if (!conversation || conversation.platform !== WEB_CHAT_PLATFORM) {
      return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
    }
    if (!advisor) {
      return NextResponse.json({ error: "El asesor no existe" }, { status: 404 });
    }

    // El primero que responde se queda el lead, igual que en la bandeja movil.
    if (conversation.leadId && !conversation.lead?.assignedToId) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { assignedToId: advisor.id },
      });
    }

    const resultado = await crearMensajeConAdjunto({
      conversationId: conversation.id,
      adjunto,
      senderType: "advisor",
      senderId: advisor.id,
      texto,
      durationMs: Number.isFinite(duracionRaw) ? duracionRaw : null,
      fileName: (form.get("file") as File)?.name || null,
    });

    await marcarContactado(conversation.leadId, advisor.id);

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { visitorNotifiedAt: null },
    });

    return NextResponse.json({ ...resultado, autor: advisor.name });
  } catch (error) {
    if (error instanceof ErrorDeAdjunto) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[web-chat/reply-media] Error guardando el adjunto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
