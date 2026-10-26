import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey, rateLimit } from "@/lib/web-chat";
import {
  ALI_SENDER,
  HANDOFF_SOURCE,
  avisarDerivacion,
  contextoParaAli,
  conversacionDelVisitante,
  estadoAli,
} from "@/lib/ali";

export const dynamic = "force-dynamic";

const MAX_LARGO = 2000;

/**
 * Contexto para que Ali responda: datos del cliente, si Ali sigue a cargo y
 * los últimos mensajes de la conversación.
 */
export async function GET(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const conversationId = (url.searchParams.get("conversationId") || "").trim();
  const sessionId = (url.searchParams.get("sessionId") || "").trim();

  if (!conversationId || !sessionId) {
    return NextResponse.json({ error: "Faltan datos de la conversación" }, { status: 400 });
  }

  try {
    const conversation = await conversacionDelVisitante(conversationId, sessionId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const contexto = await contextoParaAli(conversation.id);
    const lead = conversation.lead;

    return NextResponse.json({
      ...contexto,
      cliente: {
        nombre:
          [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") ||
          conversation.metaName ||
          null,
        telefono: lead?.phone || null,
        email: lead?.email || null,
        interes: lead?.interests || null,
      },
      asesorAsignado: lead?.assignedTo?.name || null,
    });
  } catch (error) {
    console.error("[web-chat/ali] Error armando el contexto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Guarda un mensaje de Ali. Con `derivacion`, además avisa a los asesores por
 * push y al grupo de WhatsApp de leads.
 *
 * Si un asesor ya tomó la conversación responde 409 y no guarda nada: Ali pudo
 * haber empezado a escribir justo antes de que el asesor contestara.
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
  const derivacion =
    body.derivacion && typeof body.derivacion === "object"
      ? {
          motivo: String(body.derivacion.motivo || "").trim().slice(0, 300) || "Pide hablar con un asesor",
          resumen: String(body.derivacion.resumen || "").trim().slice(0, 600),
        }
      : null;

  if (!conversationId || !sessionId) {
    return NextResponse.json({ error: "Faltan datos de la conversación" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "El mensaje viene vacío" }, { status: 400 });
  }
  if (text.length > MAX_LARGO) {
    return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 400 });
  }

  if (!rateLimit(`ali:${conversationId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados mensajes seguidos" }, { status: 429 });
  }

  try {
    const conversation = await conversacionDelVisitante(conversationId, sessionId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const estado = await estadoAli(conversation.id);
    if (!estado.activa) {
      return NextResponse.json({ error: "Un asesor ya tomó la conversación" }, { status: 409 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        text,
        senderType: ALI_SENDER,
        sourceType: derivacion ? HANDOFF_SOURCE : "DIRECT",
      },
      select: { id: true, createdAt: true },
    });

    // Sube la conversación en la bandeja, igual que una respuesta del asesor.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    if (derivacion) {
      const lead = conversation.lead;
      const nombre =
        [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") ||
        conversation.metaName ||
        "Un visitante";

      if (conversation.leadId) {
        await prisma.lead.update({
          where: { id: conversation.leadId },
          data: {
            lastActivity: `Ali pidió un asesor: ${derivacion.motivo}`.slice(0, 190),
            lastNoteAt: new Date(),
          },
        });
      }

      await avisarDerivacion({
        leadId: conversation.leadId,
        nombre,
        motivo: derivacion.motivo,
        resumen: derivacion.resumen,
        asignadoId: lead?.assignedToId || null,
        asignadoNombre: lead?.assignedTo?.name || null,
      });
    }

    return NextResponse.json({ id: message.id, createdAt: message.createdAt });
  } catch (error) {
    console.error("[web-chat/ali] Error guardando el mensaje de Ali:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
