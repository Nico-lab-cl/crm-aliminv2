import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { WEB_CHAT_PLATFORM } from "@/lib/web-chat";
import { ErrorDeAdjunto, crearMensajeConAdjunto, validarAdjunto } from "@/lib/media";
import { marcarContactado } from "@/lib/followups";

export const dynamic = "force-dynamic";

/**
 * El asesor envia una foto, un audio o un video al chat web.
 *
 * Este es el endpoint que usa la bandeja del APK y la del navegador. El envio
 * de texto sigue en /api/messages/send: son endpoints distintos porque uno
 * recibe JSON y el otro multipart, y mezclarlos obligaria a ramificar el
 * parseo del cuerpo antes de saber que hay adentro.
 *
 * Solo funciona en el chat web. Messenger, Instagram y TikTok necesitan que el
 * archivo se suba primero a la API de cada plataforma y aca no hay nada de eso;
 * dejar pasar el envio guardaria el adjunto en el CRM y el cliente no lo
 * recibiria nunca, que es la peor de las fallas posibles: silenciosa.
 */
export async function POST(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const advisorId = (session.user as any).id as string;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "El envio no es un formulario valido" }, { status: 400 });
  }

  const conversationId = String(form.get("conversationId") || "").trim();
  const texto = String(form.get("text") || "").trim();
  const duracionRaw = Number(form.get("durationMs") || 0);

  if (!conversationId) {
    return NextResponse.json({ error: "Falta la conversacion" }, { status: 400 });
  }

  try {
    const adjunto = await validarAdjunto(form.get("file"));

    const conversation = await (prisma as any).conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        platform: true,
        leadId: true,
        lead: { select: { assignedToId: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
    }

    if (conversation.platform !== WEB_CHAT_PLATFORM) {
      return NextResponse.json(
        {
          error:
            "Por ahora los adjuntos solo se pueden enviar por el chat de la pagina web. En Messenger e Instagram sigue funcionando el texto.",
        },
        { status: 400 }
      );
    }

    // El primero que responde se queda el lead, igual que con un mensaje de
    // texto. Un audio es una respuesta como cualquier otra.
    if (conversation.leadId && !conversation.lead?.assignedToId) {
      await (prisma as any).lead.update({
        where: { id: conversation.leadId },
        data: { assignedToId: advisorId },
      });
    }

    const resultado = await crearMensajeConAdjunto({
      conversationId: conversation.id,
      adjunto,
      senderType: "advisor",
      senderId: advisorId,
      texto,
      durationMs: Number.isFinite(duracionRaw) ? duracionRaw : null,
      fileName: (form.get("file") as File)?.name || null,
    });

    // Responderle al cliente es atenderlo: se apagan los recordatorios sin que
    // el asesor tenga que acordarse de tocar el interruptor de la ficha.
    await marcarContactado(conversation.leadId, advisorId);

    // Reabre el aviso al visitante, igual que hace una respuesta de texto.
    await (prisma as any).conversation.update({
      where: { id: conversation.id },
      data: { visitorNotifiedAt: null },
    });

    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof ErrorDeAdjunto) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[messages/media] Error enviando el adjunto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
