import prisma from "./prisma";
import { anotar } from "./respuestaAutomatica";
import { WA_PLATFORM, numeroDePsid } from "./whatsapp";

/**
 * Pausa de Ali por conversación (Nicolás, 22-11-2026).
 *
 * En los chats de WhatsApp que se atienden desde el CRM web (por ahora solo el
 * +56 9 8257 9808), Ali deja de responder:
 *   - cuando escribe una persona, desde el CRM web o desde el móvil;
 *   - cuando Ali deriva ("te paso con un asesor") o no logra responder;
 *   - cuando alguien la pausa a mano desde el CRM web.
 * Y no vuelve sola: solo cuando alguien aprieta "Reactivar" en el CRM web. En
 * esos chats esto reemplaza la regla de las 2 h de lib/aliRedes.ts.
 *
 * La pausa manual vale para cualquier conversación; la automática, solo para
 * los números de WHATSAPP_NUMEROS_CON_PAUSA (ids de número separados por coma;
 * por defecto 1365363313337302 = +56 9 8257 9808).
 *
 * Vive en una tabla propia (public.ali_pausas) y no en una columna de
 * Conversation: así no hay que correr una migración antes de desplegar, y si
 * la tabla falta se crea sola (mismo criterio que avisosLeadScore.ts).
 */

const NUMEROS_POR_DEFECTO = "1365363313337302";

export function numerosConPausa(): string[] {
  return (process.env.WHATSAPP_NUMEROS_CON_PAUSA || NUMEROS_POR_DEFECTO)
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

/** ¿En este chat Ali se pausa sola al escribir una persona o al derivar? */
export function usaPausaHastaReactivar(conv: { platform: string; psid: string }) {
  return conv.platform === WA_PLATFORM && numerosConPausa().includes(numeroDePsid(conv.psid));
}

let tablaLista: Promise<void> | null = null;

export function asegurarTablaPausas(): Promise<void> {
  if (!tablaLista) {
    tablaLista = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS public.ali_pausas (
           conversation_id text PRIMARY KEY,
           pausada_en      timestamptz NOT NULL DEFAULT now(),
           pausada_por     text,
           motivo          text
         )`
      )
      .then(() => undefined)
      .catch((error) => {
        tablaLista = null; // Se reintenta en la próxima llamada.
        throw error;
      });
  }
  return tablaLista;
}

export interface EstadoPausa {
  pausadaEn: Date;
  pausadaPor: string | null;
  motivo: string | null;
}

/** La pausa vigente de la conversación, o null si Ali está activa. Ante un error, null (no frena a Ali). */
export async function pausaDe(conversationId: string): Promise<EstadoPausa | null> {
  try {
    await asegurarTablaPausas();
    const filas = await prisma.$queryRaw<{ pausada_en: Date; pausada_por: string | null; motivo: string | null }[]>`
      SELECT pausada_en, pausada_por, motivo FROM public.ali_pausas WHERE conversation_id = ${conversationId}`;
    const f = filas[0];
    return f ? { pausadaEn: f.pausada_en, pausadaPor: f.pausada_por, motivo: f.motivo } : null;
  } catch (error) {
    console.error(`[pausa-ali] No se pudo leer la pausa de ${conversationId}:`, error);
    return null;
  }
}

export async function aliPausada(conversationId: string) {
  return Boolean(await pausaDe(conversationId));
}

/**
 * Pausa a Ali en la conversación. Si ya estaba pausada no hace nada (ni repite
 * la nota). Devuelve true si la pausó ahora.
 */
export async function pausarAli(conversationId: string, quien: string, motivo: string): Promise<boolean> {
  await asegurarTablaPausas();
  const n = await prisma.$executeRaw`
    INSERT INTO public.ali_pausas (conversation_id, pausada_por, motivo)
    VALUES (${conversationId}, ${quien.slice(0, 120)}, ${motivo.slice(0, 200)})
    ON CONFLICT (conversation_id) DO NOTHING`;
  if (n > 0) {
    await anotar(conversationId, `⏸️ Ali quedó en pausa (${motivo}). Vuelve a responder cuando alguien la reactive desde el CRM web.`);
    console.log(`[pausa-ali] ${conversationId}: pausada por ${quien} (${motivo}).`);
  }
  return n > 0;
}

/** Saca la pausa. Devuelve true si estaba pausada. */
export async function reactivarAli(conversationId: string, quien: string): Promise<boolean> {
  await asegurarTablaPausas();
  const n = await prisma.$executeRaw`DELETE FROM public.ali_pausas WHERE conversation_id = ${conversationId}`;
  if (n > 0) {
    await anotar(conversationId, `▶️ ${quien} reactivó a Ali en este chat.`);
    console.log(`[pausa-ali] ${conversationId}: reactivada por ${quien}.`);
  }
  return n > 0;
}

/**
 * Pausa automática: solo en los chats que usan "pausa hasta reactivar". Nunca
 * lanza (se llama después de mandar un mensaje que ya salió).
 */
export async function pausarSiCorresponde(conversationId: string, quien: string, motivo: string) {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { platform: true, psid: true },
    });
    if (!conv || !usaPausaHastaReactivar(conv)) return false;
    return await pausarAli(conversationId, quien, motivo);
  } catch (error) {
    console.error(`[pausa-ali] No se pudo pausar ${conversationId}:`, error);
    return false;
  }
}
