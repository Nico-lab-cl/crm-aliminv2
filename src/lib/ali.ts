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

export interface EstadoAli {
  /** Ningún asesor escribió todavía: Ali responde. */
  activa: boolean;
  /** Cuándo pidió Ali un asesor por última vez, si lo pidió. */
  derivadaAt: Date | null;
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
 * Regla de "el primero que responde se queda el lead", con la derivación de Ali.
 *
 * Sin dueño, el lead es del primero que responde, como siempre. Si Ali pidió
 * un asesor, el lead también es del primero que responde aunque la rueda ya se
 * lo haya asignado a otro: la derivación sale al grupo para que lo tome
 * cualquiera, y quien lo toma se lo queda.
 */
export async function asignarAlQueResponde(
  conversation: { id: string; leadId: string | null; lead?: { assignedToId: string | null } | null },
  advisorId: string
) {
  if (!conversation.leadId) return;

  let asignar = !conversation.lead?.assignedToId;

  if (!asignar && conversation.lead?.assignedToId !== advisorId) {
    const estado = await estadoAli(conversation.id);
    asignar = estado.activa && estado.derivadaAt !== null;
  }

  if (asignar) {
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
 * Avisa que un cliente del chat web necesita una persona: push a todos los
 * asesores de la rueda (y al asignado, si es otro) y mensaje al grupo de
 * WhatsApp de leads. Nunca lanza: un aviso caído no puede tumbar el chat.
 */
export async function avisarDerivacion({
  leadId,
  nombre,
  motivo,
  resumen,
  asignadoId,
  asignadoNombre,
}: {
  leadId: string | null;
  nombre: string;
  motivo: string;
  resumen: string;
  asignadoId: string | null;
  asignadoNombre: string | null;
}) {
  const destinatarios = new Set<string>(ASESORES_ANUNCIABLES);
  if (asignadoId) destinatarios.add(asignadoId);

  const push = Promise.allSettled(
    Array.from(destinatarios).map((userId) =>
      createNotification({
        userId,
        title: `🙋 ${nombre} pide un asesor en el chat web`,
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
      "🙋 *Cliente pide un asesor · Chat web*",
      "",
      `*Cliente:* ${nombre}`,
      `*Motivo:* ${motivo}`,
      resumen ? `*Lo que conversó con Ali:* ${resumen}` : null,
      asignadoNombre ? `*Asesor asignado:* ${asignadoNombre}` : "*Asesor asignado:* sin asignar",
      "",
      "El primero que le responda desde el CRM se queda el lead.",
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
