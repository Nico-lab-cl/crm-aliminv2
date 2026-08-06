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

export const dynamic = "force-dynamic";

const MAX_LARGO = 2000;

/** Ventana en la que no se repite el aviso, para que escribir seguido no dispare varios push. */
const VENTANA_AVISO_MS = 3 * 60 * 1000;

/**
 * Recibe un mensaje del visitante desde aliminspa.cl y avisa a los asesores.
 */
export async function POST(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const conversationId = String(body.conversationId || "").trim();
  const sessionId = String(body.sessionId || "").trim();
  const text = String(body.text || "").trim();

  if (!conversationId || !sessionId) {
    return NextResponse.json({ error: "Faltan datos de la conversación" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "El mensaje viene vacío" }, { status: 400 });
  }
  if (text.length > MAX_LARGO) {
    return NextResponse.json(
      { error: `El mensaje supera los ${MAX_LARGO} caracteres` },
      { status: 400 }
    );
  }

  if (!rateLimit(`msg:${conversationId}`, 20, 60 * 1000)) {
    return NextResponse.json(
      { error: "Estás enviando mensajes muy rápido, espera unos segundos." },
      { status: 429 }
    );
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, psid: true, platform: true, leadId: true, metaName: true },
    });

    // La sesión del visitante es la que autoriza: sin el sessionId correcto no
    // se puede escribir en una conversación ajena aunque se conozca su id.
    if (
      !conversation ||
      conversation.platform !== WEB_CHAT_PLATFORM ||
      conversation.psid !== webChatPsid(sessionId)
    ) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const ultimoDelVisitante = await prisma.message.findFirst({
      where: { conversationId: conversation.id, senderType: WEB_CHAT_SENDER },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        text,
        senderType: WEB_CHAT_SENDER,
        sourceType: "DIRECT",
      },
      select: { id: true, createdAt: true },
    });

    // La bandeja ordena por updatedAt de la conversación, así que hay que
    // tocarla explícitamente: crear el mensaje por sí solo no la mueve arriba.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { visitorLastSeenAt: new Date(), visitorNotifiedAt: null },
    });

    if (conversation.leadId) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { lastActivity: "Mensaje en el chat web", lastNoteAt: new Date() },
      });
    }

    const esRafaga =
      ultimoDelVisitante &&
      Date.now() - ultimoDelVisitante.createdAt.getTime() < VENTANA_AVISO_MS;

    if (!esRafaga) {
      await notifyAdvisorsOfWebChat({
        leadId: conversation.leadId,
        visitorName: conversation.metaName || "Un visitante",
        text,
      });
    }

    return NextResponse.json({ id: message.id, createdAt: message.createdAt });
  } catch (error) {
    console.error("[web-chat/message] Error guardando mensaje:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
