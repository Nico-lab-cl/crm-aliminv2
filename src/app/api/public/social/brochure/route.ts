import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey } from "@/lib/web-chat";
import { registrarBrochureAbierto } from "@/lib/respuestaAutomatica";

/**
 * aliminspa.cl avisa que alguien abrió el brochure que le mandó la respuesta
 * automática de Instagram o Facebook. Queda como nota en su conversación.
 * Usa la misma API key que el chat web (WEB_CHAT_API_KEY).
 */
export async function POST(req: Request) {
  const noAutorizado = checkWebChatKey(req);
  if (noAutorizado) return noAutorizado;

  const { conversationId, brochure } = await req.json().catch(() => ({}));
  if (typeof conversationId !== "string" || !["lomas-del-mar", "arena-y-sol"].includes(brochure)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // El enlace corto solo lleva los 8 primeros caracteres del id.
  const conv = /^[0-9a-f]{8}$/i.test(conversationId)
    ? await (prisma as any).conversation.findFirst({
        where: { id: { startsWith: conversationId.toLowerCase() } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
    : await (prisma as any).conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ ok: false }, { status: 404 });

  const nueva = await registrarBrochureAbierto(conv.id, brochure);
  return NextResponse.json({ ok: true, nueva });
}
