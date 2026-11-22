import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { enviarTextoWhatsapp, numeroDePsid, waIdDePsid } from "@/lib/whatsapp";
import { cargarConversacionYAsesor, despuesDeEnviar, respuestaRechazo, revisarVentana } from "@/lib/whatsappCrmWeb";

export const dynamic = "force-dynamic";

const MAX_LARGO = 4000;

/**
 * Texto de un asesor a un chat de WhatsApp de Ali, escrito desde el CRM web.
 * Sale por el mismo número al que escribió el cliente, queda a nombre del
 * asesor elegido y deja a Ali en pausa (lib/whatsappCrmWeb.ts).
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
  if (!conversationId || !advisorId) return NextResponse.json({ error: "Faltan la conversación o el asesor" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "El mensaje viene vacío" }, { status: 400 });
  if (text.length > MAX_LARGO) return NextResponse.json({ error: `El mensaje supera los ${MAX_LARGO} caracteres` }, { status: 400 });
  if (!rateLimit(`wa-reply:${conversationId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados mensajes seguidos" }, { status: 429 });
  }

  try {
    const cargado = await cargarConversacionYAsesor(conversationId, advisorId);
    if ("error" in cargado) return cargado.error;
    const { conversation, advisor } = cargado;

    const ventana = await revisarVentana(conversation.id);
    if (ventana) return ventana;

    let wamid: string | null;
    try {
      wamid = await enviarTextoWhatsapp(waIdDePsid(conversation.psid), text, numeroDePsid(conversation.psid));
    } catch (error) {
      return respuestaRechazo(error);
    }

    const message = await prisma.message.create({
      data: { conversationId: conversation.id, text, senderId: advisor.id, senderType: "advisor", sourceType: "DIRECT", sourceId: wamid },
      select: { id: true, createdAt: true },
    });
    await despuesDeEnviar(conversation, advisor);

    return NextResponse.json({ id: message.id, createdAt: message.createdAt, autor: advisor.name });
  } catch (error) {
    console.error("[whatsapp/reply] Error enviando la respuesta:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
