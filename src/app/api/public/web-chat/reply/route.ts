import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { WEB_CHAT_PLATFORM, checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { marcarContactado } from "@/lib/followups";

export const dynamic = "force-dynamic";

const MAX_LARGO = 2000;

/**
 * Respuesta de un asesor enviada desde el CRM web.
 *
 * El CRM web lee las conversaciones directamente de la base, pero no escribe
 * en ellas: su lib/db declara la base principal como solo lectura y, sobre
 * todo, conviene que la asignación del lead y el orden de la bandeja tengan un
 * solo responsable. Ese responsable es este endpoint.
 *
 * A diferencia de /api/messages/send, aquí no hay sesión de NextAuth: el CRM
 * web se autentica con la API key e indica de parte de qué asesor escribe.
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
  const advisorId = String(body.advisorId || "").trim();
  const text = String(body.text || "").trim();

  if (!conversationId || !advisorId) {
    return NextResponse.json({ error: "Faltan la conversación o el asesor" }, { status: 400 });
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

  if (!rateLimit(`reply:${conversationId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas respuestas seguidas" }, { status: 429 });
  }

  try {
    const [conversation, advisor] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, platform: true, leadId: true, lead: { select: { assignedToId: true } } },
      }),
      prisma.user.findUnique({ where: { id: advisorId }, select: { id: true, name: true } }),
    ]);

    if (!conversation || conversation.platform !== WEB_CHAT_PLATFORM) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    if (!advisor) {
      return NextResponse.json({ error: "El asesor no existe" }, { status: 404 });
    }

    // El primero que responde se queda el lead, igual que en la bandeja móvil.
    if (conversation.leadId && !conversation.lead?.assignedToId) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { assignedToId: advisor.id },
      });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        text,
        senderId: advisor.id,
        senderType: "advisor",
        sourceType: "DIRECT",
      },
      select: { id: true, createdAt: true },
    });

    // Responder al cliente cuenta como haberlo atendido: corta los
    // recordatorios de seguimiento igual que el interruptor de la ficha.
    await marcarContactado(conversation.leadId, advisor.id);

    // Mueve la conversación al tope de la bandeja y reabre el aviso al visitante.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { visitorNotifiedAt: null },
    });

    return NextResponse.json({
      id: message.id,
      createdAt: message.createdAt,
      autor: advisor.name,
    });
  } catch (error) {
    console.error("[web-chat/reply] Error guardando la respuesta:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
