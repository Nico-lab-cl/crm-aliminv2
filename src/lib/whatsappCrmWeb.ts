import { NextResponse } from "next/server";
import prisma from "./prisma";
import { DUENO_MIENTRAS_ALI } from "./ali";
import { marcarContactado } from "./followups";
import { anotar } from "./respuestaAutomatica";
import { pausarSiCorresponde } from "./pausaAli";
import { ErrorWhatsapp, WA_PLATFORM, motivoRechazoWhatsapp } from "./whatsapp";

/**
 * Lo que comparten las rutas /api/public/whatsapp/* con las que el CRM web
 * (marketing.aliminspa.cl) atiende los chats de WhatsApp de Ali (Nicolás,
 * 22-11-2026). El CRM web lee la base directo, pero todo lo que escribe en una
 * conversación pasa por acá, igual que el chat web (api/public/web-chat/reply):
 * así el envío, la asignación del lead y la pausa de Ali tienen un solo dueño.
 *
 * Se autentican con la misma WEB_CHAT_API_KEY del chat web (cabecera
 * x-crm-api-key) y dicen de parte de qué asesor escriben.
 */

const VENTANA_MS = 24 * 60 * 60 * 1000;

export const MENSAJE_VENTANA_VENCIDA =
  "Pasaron más de 24 horas desde el último mensaje del cliente, y WhatsApp no deja escribirle sin una plantilla aprobada. Llámalo desde su ficha o espera a que vuelva a escribir.";

/** Planos y brochures que se pueden mandar con un botón (los sirve aliminspa.cl/documentos/<id>, siempre la versión más nueva). */
export const DOCUMENTOS_CRM_WEB: Record<string, { nombre: string; tipo: "pdf" | "imagen" }> = {
  plano_lomas_del_mar: { nombre: "Plano Lomas del Mar", tipo: "imagen" },
  plano_arena_y_sol: { nombre: "Plano Arena y Sol", tipo: "imagen" },
  brochure_lomas_del_mar: { nombre: "Brochure Lomas del Mar", tipo: "pdf" },
  brochure_arena_y_sol: { nombre: "Brochure Arena y Sol", tipo: "pdf" },
};

export function urlDocumento(id: string) {
  const base = (process.env.ALI_SITIO_URL || "https://aliminspa.cl").replace(/\/+$/, "");
  return `${base}/documentos/${id}`;
}

export type ConversacionWa = {
  id: string;
  psid: string;
  platform: string;
  leadId: string | null;
  lead: { assignedToId: string | null } | null;
};

/** Conversación de WhatsApp y asesor; o la respuesta de error lista para devolver. */
export async function cargarConversacionYAsesor(conversationId: string, advisorId: string) {
  const [conversation, advisor] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, psid: true, platform: true, leadId: true, lead: { select: { assignedToId: true } } },
    }),
    prisma.user.findUnique({ where: { id: advisorId }, select: { id: true, name: true } }),
  ]);
  if (!conversation || conversation.platform !== WA_PLATFORM) {
    return { error: NextResponse.json({ error: "Conversación de WhatsApp no encontrada" }, { status: 404 }) };
  }
  if (!advisor) return { error: NextResponse.json({ error: "El asesor no existe" }, { status: 404 }) };
  return { conversation: conversation as ConversacionWa, advisor };
}

/** null si se puede escribir; si no, la respuesta 409 con el motivo (ventana de 24 h). */
export async function revisarVentana(conversationId: string) {
  const ultimo = await prisma.message.findFirst({
    where: { conversationId, senderType: "meta" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!ultimo || Date.now() - ultimo.createdAt.getTime() > VENTANA_MS) {
    return NextResponse.json({ error: MENSAJE_VENTANA_VENCIDA, motivo: MENSAJE_VENTANA_VENCIDA }, { status: 409 });
  }
  return null;
}

/** Respuesta 502 con el motivo en palabras del asesor, cuando WhatsApp rechaza el envío. */
export function respuestaRechazo(error: unknown) {
  const detalle = error instanceof ErrorWhatsapp ? error.detalle : null;
  console.error("[whatsapp-crm-web] WhatsApp rechazó el envío:", error);
  const motivo = motivoRechazoWhatsapp(detalle);
  return NextResponse.json({ error: motivo, motivo, details: detalle }, { status: 502 });
}

/**
 * Después de que el mensaje salió y quedó guardado: el lead sin asesor (o el
 * que tiene Nicolás solo mientras lo atiende Ali) queda con quien escribió, se
 * cortan los recordatorios de seguimiento, el chat sube en la bandeja y Ali
 * queda en pausa hasta que la reactiven.
 */
export async function despuesDeEnviar(conversation: ConversacionWa, advisor: { id: string; name: string | null }) {
  const nombre = advisor.name || "Un asesor";
  if (conversation.leadId && advisor.id !== DUENO_MIENTRAS_ALI) {
    const tomado = await prisma.lead.updateMany({
      where: { id: conversation.leadId, OR: [{ assignedToId: null }, { assignedToId: DUENO_MIENTRAS_ALI }] },
      data: { assignedToId: advisor.id, lastActivity: `${nombre} respondió por WhatsApp desde el CRM web`.slice(0, 190) },
    });
    if (tomado.count) await anotar(conversation.id, `➡️ El lead quedó a cargo de ${nombre}, que respondió desde el CRM web.`);
  }
  await marcarContactado(conversation.leadId, advisor.id);
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await pausarSiCorresponde(conversation.id, nombre, "respondió una persona");
}
