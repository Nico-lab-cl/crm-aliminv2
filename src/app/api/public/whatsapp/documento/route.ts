import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { enviarArchivoWhatsapp, numeroDePsid, waIdDePsid } from "@/lib/whatsapp";
import {
  DOCUMENTOS_CRM_WEB,
  cargarConversacionYAsesor,
  despuesDeEnviar,
  respuestaRechazo,
  revisarVentana,
  urlDocumento,
} from "@/lib/whatsappCrmWeb";

export const dynamic = "force-dynamic";

/**
 * Manda desde el CRM web un plano o un brochure (los mismos que manda Ali, en
 * su versión más nueva) a un chat de WhatsApp. Solo los de DOCUMENTOS_CRM_WEB:
 * nunca una URL que venga en la petición.
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
  const documentoId = String(body.documento || "").trim();
  const documento = DOCUMENTOS_CRM_WEB[documentoId];
  if (!conversationId || !advisorId) return NextResponse.json({ error: "Faltan la conversación o el asesor" }, { status: 400 });
  if (!documento) return NextResponse.json({ error: "Ese documento no existe" }, { status: 400 });
  if (!rateLimit(`wa-doc:${conversationId}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados envíos seguidos" }, { status: 429 });
  }

  try {
    const cargado = await cargarConversacionYAsesor(conversationId, advisorId);
    if ("error" in cargado) return cargado.error;
    const { conversation, advisor } = cargado;

    const ventana = await revisarVentana(conversation.id);
    if (ventana) return ventana;

    const url = urlDocumento(documentoId);
    let wamid: string | null;
    try {
      wamid = await enviarArchivoWhatsapp(
        waIdDePsid(conversation.psid),
        { nombre: documento.nombre, tipo: documento.tipo, url },
        numeroDePsid(conversation.psid)
      );
    } catch (error) {
      return respuestaRechazo(error);
    }

    // Igual que los documentos de Ali: "📎 nombre", y las imágenes con su URL para verlas en la bandeja.
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        text: `📎 ${documento.nombre}${documento.tipo === "pdf" ? " (PDF)" : ""}`,
        senderId: advisor.id,
        senderType: "advisor",
        sourceType: "DIRECT",
        sourceId: wamid,
        // Un PDF con mediaUrl la bandeja móvil lo pintaría como foto rota.
        mediaUrl: documento.tipo === "imagen" ? url : null,
      },
      select: { id: true, createdAt: true },
    });
    await despuesDeEnviar(conversation, advisor);

    return NextResponse.json({ id: message.id, createdAt: message.createdAt, autor: advisor.name });
  } catch (error) {
    console.error("[whatsapp/documento] Error mandando el documento:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
