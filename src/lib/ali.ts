import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { createNotification } from "./notifications";
import { WEB_CHAT_PLATFORM, WEB_CHAT_SENDER, webChatPsid } from "./web-chat";
import { ASESORES_ANUNCIABLES, enviarAlGrupo } from "./avisosWhatsappLeads";

/**
 * Ali, la asistente con IA del chat web de aliminspa.cl.
 *
 * El modelo corre en el sitio público, que es donde están la agenda, los
 * planos de lotes y las páginas que Ali consulta. Acá sólo vive lo que le toca
 * al CRM: guardar lo que Ali escribe en la misma conversación que leen los
 * asesores, y avisar cuando Ali pide que entre una persona.
 *
 * Estados de una conversación, sin columnas nuevas en la base:
 *   - Ali atiende mientras ningún asesor haya escrito en la conversación.
 *   - "Derivada": hay un mensaje de Ali con sourceType HANDOFF. Ali sigue
 *     respondiendo lo que sabe, pero los asesores ya fueron avisados y vuelven
 *     a recibir un push por cada mensaje del cliente.
 *   - En cuanto un asesor escribe, Ali se calla para siempre en esa conversación.
 */

export const ALI_SENDER = "ali";
export const ALI_NOMBRE = "Ali";
/** sourceType del mensaje de Ali que pide un asesor. */
export const HANDOFF_SOURCE = "HANDOFF";

/** Dueño de los leads que crea Ali en redes mientras ella los atiende: Nicolás (12-11-2026). */
export const DUENO_MIENTRAS_ALI = "initial-admin-id";
/** Fuente de los leads que crea Ali en Instagram y Facebook (ver lib/aliRedes.ts). */
export const FUENTES_IA = ["Instagram - IA", "Facebook - IA"];

export interface EstadoAli {
  /** Ningún asesor escribió todavía: Ali responde. */
  activa: boolean;
  /** Cuándo pidió Ali un asesor por última vez, si lo pidió. */
  derivadaAt: Date | null;
}

/**
 * Qué conversaciones entran a la bandeja del CRM (/inbox, la misma pantalla en
 * la web y en la app de asesores).
 *
 *   - El chat web que atendió Ali.
 *   - De Instagram y Facebook, solo lo que Ali derivó a una persona: pidió un
 *     asesor (mensaje HANDOFF) o pasó su lead a la rueda (pasarAlAsesor en
 *     lib/aliRedes.ts). El resto de Messenger, Instagram y los comentarios no
 *     entra: eran miles de conversaciones y la pantalla se ponía lenta.
 *   - Un asesor ve sus propios chats y los que todavía no tienen dueño (el
 *     primero que responde se queda el lead). Los asignados a otro asesor no
 *     los ve ni los puede abrir. El administrador ve todos.
 */
export function filtroBandeja(usuario: { id: string; role?: string | null }): Prisma.ConversationWhereInput {
  const filtro: Prisma.ConversationWhereInput = {
    OR: [
      { platform: WEB_CHAT_PLATFORM, messages: { some: { senderType: ALI_SENDER } } },
      {
        platform: { in: ["instagram", "facebook"] },
        OR: [
          { messages: { some: { senderType: ALI_SENDER, sourceType: HANDOFF_SOURCE } } },
          // Lead de Ali que ya salió de las manos de Nicolás hacia un asesor.
          { lead: { is: { source: { in: FUENTES_IA }, assignedToId: { not: DUENO_MIENTRAS_ALI } } } },
        ],
      },
    ],
  };
  if (usuario.role === "ADMIN") return filtro;

  return {
    AND: [
      filtro,
      {
        OR: [
          { lead: { is: { assignedToId: usuario.id } } },
          { lead: { is: { assignedToId: null } } },
          // Ali puede derivar en redes antes de que la persona dé sus datos.
          { leadId: null },
        ],
      },
    ],
  };
}

/** ¿Puede este usuario abrir o responder esta conversación desde la bandeja? */
export async function puedeVerConversacion(
  conversationId: string,
  usuario: { id: string; role?: string | null }
) {
  const visibles = await prisma.conversation.count({
    where: { AND: [{ id: conversationId }, filtroBandeja(usuario)] },
  });
  return visibles > 0;
}

export async function estadoAli(conversationId: string): Promise<EstadoAli> {
  const [deAsesor, derivacion] = await Promise.all([
    prisma.message.findFirst({
      where: { conversationId, senderType: "advisor" },
      select: { id: true },
    }),
    prisma.message.findFirst({
      where: { conversationId, senderType: ALI_SENDER, sourceType: HANDOFF_SOURCE },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return { activa: !deAsesor, derivadaAt: derivacion?.createdAt ?? null };
}

/**
 * La conversación web de este visitante, comprobando que la sesión sea suya.
 * Devuelve null si no existe o si el sessionId no corresponde.
 */
export async function conversacionDelVisitante(conversationId: string, sessionId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      psid: true,
      platform: true,
      metaName: true,
      leadId: true,
      lead: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          interests: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
  });

  if (
    !conversation ||
    conversation.platform !== WEB_CHAT_PLATFORM ||
    conversation.psid !== webChatPsid(sessionId)
  ) {
    return null;
  }

  return conversation;
}

/**
 * Regla de "el primero que responde se queda el lead".
 *
 * Solo vale para el lead sin dueño. Si ya tiene asesor, sigue siendo suyo
 * aunque Ali haya pedido una persona: la derivación se le avisa a él (ver
 * avisarDerivacion) y los demás asesores ni ven ese chat en la bandeja.
 */
export async function asignarAlQueResponde(
  conversation: { id: string; leadId: string | null; lead?: { assignedToId: string | null } | null },
  advisorId: string
) {
  if (!conversation.leadId) return;

  if (!conversation.lead?.assignedToId) {
    await prisma.lead.update({
      where: { id: conversation.leadId },
      data: { assignedToId: advisorId },
    });
  }
}

/**
 * ¿Hay que mandar push por este mensaje del visitante?
 * Mientras Ali atiende sola no: los asesores sólo se enteran cuando ella deriva.
 */
export async function avisarMensajeDelVisitante(conversationId: string) {
  const estado = await estadoAli(conversationId);
  return !estado.activa || estado.derivadaAt !== null;
}

/** Lo que Ali necesita para responder: datos del cliente y la conversación reciente. */
export async function contextoParaAli(conversationId: string) {
  const [estado, recientes] = await Promise.all([
    estadoAli(conversationId),
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        text: true,
        senderType: true,
        sourceType: true,
        createdAt: true,
        media: { select: { id: true, kind: true, mimeType: true } },
      },
    }),
  ]);

  return {
    ...estado,
    mensajes: recientes.reverse().map((m) => ({
      id: m.id,
      texto: m.text,
      de:
        m.senderType === WEB_CHAT_SENDER
          ? "cliente"
          : m.senderType === ALI_SENDER
            ? "ali"
            : "asesor",
      derivacion: m.senderType === ALI_SENDER && m.sourceType === HANDOFF_SOURCE,
      createdAt: m.createdAt,
      adjunto: m.media ? { id: m.media.id, tipo: m.media.kind, mimeType: m.media.mimeType } : null,
    })),
  };
}

/**
 * Avisa que un cliente necesita una persona: push y mensaje al grupo de
 * WhatsApp de leads. Nunca lanza: un aviso caído no puede tumbar el chat.
 *
 * Si el lead ya tiene asesor, el aviso es para él: solo él recibe el push y el
 * grupo dice que le toca a él (los demás no ven ese chat en la bandeja). Sin
 * asesor, el push va a toda la rueda y el primero que responde se lo queda.
 */
export async function avisarDerivacion({
  leadId,
  nombre,
  motivo,
  resumen,
  asignadoId,
  asignadoNombre,
  canal = "Chat web",
}: {
  leadId: string | null;
  nombre: string;
  motivo: string;
  resumen: string;
  asignadoId: string | null;
  asignadoNombre: string | null;
  /** Dónde está conversando: "Chat web", "Instagram" o "Facebook". */
  canal?: string;
}) {
  const destinatarios = new Set<string>(asignadoId ? [asignadoId] : ASESORES_ANUNCIABLES);

  const push = Promise.allSettled(
    Array.from(destinatarios).map((userId) =>
      createNotification({
        userId,
        title: `🙋 ${nombre} pide un asesor ${canal === "Chat web" ? "en el chat web" : `por ${canal}`}`,
        body: motivo.length > 120 ? `${motivo.slice(0, 117)}...` : motivo,
        // Mismo tipo que el resto de los avisos del chat: los APK instalados
        // descartan en silencio los tipos que no conocen (ver web-chat.ts).
        type: "NEW_LEAD",
        leadId: leadId || undefined,
      })
    )
  );

  const whatsapp = (async () => {
    const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
    const apiKey = process.env.EVOLUTION_API_KEY;
    const grupo = process.env.LEADS_WHATSAPP_GROUP;
    if (!url || !apiKey || !grupo) {
      console.error("[ali] Falta la configuración de Evolution: la derivación no sale por WhatsApp.");
      return;
    }

    // Igual que los avisos de leads: en el grupo están todos los asesores, así
    // que no va el teléfono ni el correo del cliente.
    const texto = [
      `🙋 *Cliente pide un asesor · ${canal}*`,
      "",
      `*Cliente:* ${nombre}`,
      `*Motivo:* ${motivo}`,
      resumen ? `*Lo que conversó con Ali:* ${resumen}` : null,
      asignadoId ? `*Asesor asignado:* ${asignadoNombre || "su asesor"}` : "*Asesor asignado:* sin asignar",
      "",
      asignadoId
        ? `👉 Le toca a *${asignadoNombre || "su asesor"}*: respóndele desde la bandeja del CRM.`
        : "El primero que le responda desde el CRM se queda el lead.",
    ]
      .filter((l) => l !== null)
      .join("\n");

    await enviarAlGrupo(texto, {
      url,
      apiKey,
      instancia: process.env.EVOLUTION_INSTANCE || "nico",
      grupo,
      desde: new Date(),
    });
  })();

  const [, resultadoWhatsapp] = await Promise.allSettled([push, whatsapp]);
  if (resultadoWhatsapp.status === "rejected") {
    console.error("[ali] No salió la derivación por WhatsApp:", resultadoWhatsapp.reason);
  }
}
