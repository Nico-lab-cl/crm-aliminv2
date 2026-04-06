import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId, text, sourceType, sourceId } = await req.json();
  const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

  try {
    // 1. Obtener la conversación y el PSID
    const conversation = await (prisma as any).conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true }
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // 2. Enviar respuesta por Meta (Messenger o Comentario)
    let metaResponse;
    if (sourceType === "DIRECT") {
      // API de Messenger
      const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
      metaResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: conversation.psid },
          message: { text }
        })
      });
    } else if (sourceType === "COMMENT") {
      // Responder a un comentario específico
      if (!sourceId) return NextResponse.json({ error: "sourceId required for comments" }, { status: 400 });
      const url = `https://graph.facebook.com/v21.0/${sourceId}/comments?access_token=${PAGE_ACCESS_TOKEN}`;
      metaResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
    }

    const metaData = await metaResponse?.json();
    if (!metaResponse?.ok) {
      console.error("Error de Meta API:", metaData);
      return NextResponse.json({ error: "Failed to send message via Meta", details: metaData }, { status: 500 });
    }

    // 3. AUTO-ASIGNACIÓN: Si el Lead no tiene asesor, asignarlo al actual
    if (conversation.leadId && !conversation.lead.assignedToId) {
      await (prisma as any).lead.update({
        where: { id: conversation.leadId },
        data: { assignedToId: (session.user as any).id }
      });
    }

    // 4. Guardar el mensaje del asesor en la base de datos
    const newMessage = await (prisma as any).message.create({
      data: {
        conversationId: conversation.id,
        text,
        senderId: (session.user as any).id,
        senderType: "advisor",
        sourceType,
      }
    });

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error("Error in messaging/send:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
