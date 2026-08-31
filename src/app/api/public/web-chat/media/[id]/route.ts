import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { WEB_CHAT_PLATFORM, checkWebChatKey, rateLimit, webChatPsid } from "@/lib/web-chat";

export const dynamic = "force-dynamic";

/**
 * Entrega un adjunto al sitio publico, comprobando que sea de la conversacion
 * de quien lo pide.
 *
 * Existe aparte de /api/media/[id] por una razon concreta de seguridad. Aquel
 * acepta la API key y con eso alcanza, porque quien la tiene es un servidor de
 * confianza. Este ademas exige el sessionId del visitante y verifica que el
 * adjunto pertenezca a su conversacion, para que el servidor del sitio publico
 * no tenga que hacer esa comprobacion por su cuenta: la autorizacion vive donde
 * viven los datos, que es el unico lugar donde no se puede olvidar.
 *
 * Sin esto, un visitante que cambiara el id en la URL del proxy podria leer las
 * fotos y los audios de conversaciones de otros clientes.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const conversationId = (url.searchParams.get("conversationId") || "").trim();

  if (!sessionId || !conversationId) {
    return NextResponse.json({ error: "Faltan datos de la conversacion" }, { status: 400 });
  }

  if (!rateLimit(`media-get:${conversationId}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
  }

  try {
    const media = await (prisma as any).messageMedia.findUnique({
      where: { id: params.id },
      select: {
        mimeType: true,
        data: true,
        message: {
          select: {
            conversation: { select: { id: true, psid: true, platform: true } },
          },
        },
      },
    });

    const conversacion = media?.message?.conversation;

    if (
      !media ||
      !conversacion ||
      conversacion.id !== conversationId ||
      conversacion.platform !== WEB_CHAT_PLATFORM ||
      conversacion.psid !== webChatPsid(sessionId)
    ) {
      // Se responde 404 y no 403 a proposito: distinguirlos le confirmaria a
      // quien prueba ids al azar cuales existen.
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    const bytes: Buffer = Buffer.from(media.data);

    return new NextResponse(bytes as any, {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[web-chat/media/:id] Error entregando el adjunto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
