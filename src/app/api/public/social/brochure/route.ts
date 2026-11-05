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

  const conv = await (prisma as any).conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ ok: false }, { status: 404 });

  const nueva = await registrarBrochureAbierto(conv.id, brochure);
  return NextResponse.json({ ok: true, nueva });
}
