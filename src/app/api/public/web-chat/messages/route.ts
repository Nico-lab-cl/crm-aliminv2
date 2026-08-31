import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { WEB_CHAT_PLATFORM, checkWebChatKey, rateLimit, webChatPsid } from "@/lib/web-chat";

export const dynamic = "force-dynamic";

/**
 * Entrega al sitio público los mensajes nuevos de una conversación.
 *
 * El widget de aliminspa.cl consulta esto cada pocos segundos para mostrar las
 * respuestas del asesor.
 */
export async function GET(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const conversationId = (url.searchParams.get("conversationId") || "").trim();
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const sinceRaw = url.searchParams.get("since");

  if (!conversationId || !sessionId) {
    return NextResponse.json({ error: "Faltan datos de la conversación" }, { status: 400 });
  }

  if (!rateLimit(`poll:${conversationId}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
  }

  let since: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (!Number.isNaN(parsed.getTime())) since = parsed;
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, psid: true, platform: true },
    });

    if (
      !conversation ||
      conversation.platform !== WEB_CHAT_PLATFORM ||
      conversation.psid !== webChatPsid(sessionId)
    ) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        text: true,
        senderType: true,
        createdAt: true,
        sender: { select: { name: true, image: true } },
        // Metadatos del adjunto, sin el binario: el sitio público pide el
        // archivo aparte y lo reenvía por su propio servidor.
        media: { select: { id: true, kind: true, mimeType: true, durationMs: true } },
      },
    });

    // Se marca la presencia del visitante con SQL directo a propósito: un
    // update de Prisma tocaría updatedAt y la conversación saltaría al tope de
    // la bandeja en cada consulta, desordenándola. Además sólo se escribe una
    // vez cada 30 segundos para no golpear la base en cada ciclo del polling.
    await prisma.$executeRaw`
      UPDATE "Conversation"
      SET "visitorLastSeenAt" = NOW()
      WHERE id = ${conversation.id}
        AND ("visitorLastSeenAt" IS NULL OR "visitorLastSeenAt" < NOW() - INTERVAL '30 seconds')
    `;

    return NextResponse.json({
      messages: messages.map((m: any) => ({
        id: m.id,
        text: m.text,
        deAsesor: m.senderType === "advisor",
        autor: m.senderType === "advisor" ? m.sender?.name || "Asesor" : null,
        createdAt: m.createdAt,
        // El widget recibe el id del adjunto, no una URL del CRM. La URL
        // definitiva la arma el sitio público contra su propio dominio, para
        // que el navegador del visitante nunca llame al CRM directamente.
        adjunto: m.media
          ? {
              id: m.media.id,
              tipo: m.media.kind,
              mimeType: m.media.mimeType,
              duracionMs: m.media.durationMs,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("[web-chat/messages] Error leyendo mensajes:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
