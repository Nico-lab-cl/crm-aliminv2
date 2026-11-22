import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey } from "@/lib/web-chat";
import { WA_PLATFORM } from "@/lib/whatsapp";
import { pausaDe, pausarAli, reactivarAli } from "@/lib/pausaAli";
import { atenderAlReactivar } from "@/lib/aliRedes";

export const dynamic = "force-dynamic";

/**
 * Pausar o reactivar a Ali en un chat de WhatsApp desde el CRM web
 * (lib/pausaAli.ts). Cuerpo: { conversationId, accion: "pausar" | "reactivar", quien }.
 * Al reactivar, si el cliente quedó esperando respuesta, Ali le responde ahora.
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
  const accion = String(body.accion || "").trim();
  const quien = String(body.quien || "").trim().slice(0, 120) || "Alguien del equipo";
  if (!conversationId || (accion !== "pausar" && accion !== "reactivar")) {
    return NextResponse.json({ error: "Faltan la conversación o la acción (pausar o reactivar)" }, { status: 400 });
  }

  try {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, platform: true } });
    if (!conv || conv.platform !== WA_PLATFORM) {
      return NextResponse.json({ error: "Conversación de WhatsApp no encontrada" }, { status: 404 });
    }

    if (accion === "pausar") {
      await pausarAli(conv.id, quien, `la pausó ${quien}`);
    } else if (await reactivarAli(conv.id, quien)) {
      atenderAlReactivar(conv.id, conv.platform);
    }

    const pausa = await pausaDe(conv.id);
    return NextResponse.json({ pausada: Boolean(pausa), pausa });
  } catch (error) {
    console.error("[whatsapp/pausa] Error cambiando la pausa:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
