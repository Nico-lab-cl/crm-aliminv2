import prisma from "./prisma";
import { ESTADOS_CLIENTE, canonico, nombreEstado } from "./pipelineEtapas";
import { estadoDeVisita } from "./visitaRealizada";

/**
 * Memoria de Ali: lo que el CRM sabe de la persona antes de esta conversación.
 *
 * Ali recibe completa solo la conversación actual (desde el último silencio de
 * más de 24 h: así no vuelve a contestar preguntas viejas). Todo lo anterior le
 * llega acá como contexto: la ficha del lead, sus movimientos en el pipeline y
 * los mensajes anteriores en este y en otros canales (web, Instagram,
 * Facebook). Nicolás, 12-11-2026: "que la IA tenga conocimiento histórico del
 * lead y sus acciones".
 *
 * Es texto para el modelo, no para el cliente: Ali tiene instrucciones de no
 * contarle a la persona las notas internas, el puntaje ni la etapa.
 */

const MAX_MENSAJES_ANTERIORES = 30;
const MAX_POR_OTRO_CANAL = 15;
const DIAS_HISTORIA = 180;
const MAX_TEXTO_MENSAJE = 220;
const MAX_TOTAL = 7000;

type MensajeMemoria = { text: string; senderType: string; sourceType: string; createdAt: Date };

const CANAL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", web: "chat web", tiktok: "TikTok" };

const fecha = (d: Date) =>
  d.toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const dia = (d: Date) => d.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric" });
const corto = (t: string | null | undefined, max = MAX_TEXTO_MENSAJE) => {
  const limpio = (t || "").replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
};

/** Marca de las notas del calificador IA en lead_seguimientos (ver calificador_ia.ts del CRM web). */
export const RESULTADO_IA = "IA";

const TEXTO_CAMPO: Record<string, Record<string, string>> = {
  forma_pago: { contado: "al contado", credito_directo: "con crédito directo" },
  plazo_compra: { menos_de_3_meses: "en menos de 3 meses", "3_a_12_meses": "en 3 a 12 meses", mas_de_un_ano: "en más de un año" },
  uso: { vivir: "para vivir", veraneo: "para veranear", inversion: "como inversión" },
};

/**
 * La calificación más nueva del calificador IA, que vive en la base del CRM
 * web: se pide por su webhook con IA_SECRET. Si el CRM web no responde en 3 s,
 * Ali sigue sin esta parte.
 */
async function calificacionDelCrmWeb(leadId: string | null, conversationId: string): Promise<string | null> {
  if (!process.env.IA_SECRET) return null;
  try {
    const base = (process.env.CRM_WEB_URL || "https://marketing.aliminspa.cl").replace(/\/+$/, "");
    const params = new URLSearchParams(leadId ? { lead_id: leadId } : { conversacion_id: conversationId });
    const res = await fetch(`${base}/api/webhooks/ia/calificacion?${params}`, {
      headers: { "x-ia-secret": process.env.IA_SECRET },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const { calificaciones } = (await res.json()) as { calificaciones?: any[] };
    const c = calificaciones?.[0];
    if (!c) return null;
    const dato = (campo: string, v: unknown) => (typeof v === "string" ? TEXTO_CAMPO[campo]?.[v] : null);
    const lineasCalif = [
      c.proyecto ? `Le interesa ${c.proyecto}.` : null,
      c.tiene_pie === true ? `Tiene pie${c.pie_monto ? ` (unos $${Number(c.pie_monto).toLocaleString("es-CL")})` : ""}.` : null,
      c.tiene_pie === false ? "Dijo que no tiene pie." : null,
      dato("forma_pago", c.forma_pago) ? `Compraría ${dato("forma_pago", c.forma_pago)}.` : null,
      dato("plazo_compra", c.plazo_compra) ? `Piensa comprar ${dato("plazo_compra", c.plazo_compra)}.` : null,
      dato("uso", c.uso) ? `Lo quiere ${dato("uso", c.uso)}.` : null,
      c.quiere_visitar === true ? "Quiere visitar." : c.quiere_visitar === false ? "Dijo que no quiere visitar por ahora." : null,
      Array.isArray(c.objeciones) && c.objeciones.length ? `Objeciones: ${c.objeciones.join(", ")}.` : null,
      c.categoria ? `Categoría: ${c.categoria}.` : null,
      c.resumen ? `Resumen: ${corto(c.resumen, 400)}` : null,
    ].filter(Boolean);
    return lineasCalif.length ? lineasCalif.join("\n") : null;
  } catch (error) {
    console.error("[memoria] No se pudo leer la calificación del CRM web:", error);
    return null;
  }
}

function quien(m: MensajeMemoria) {
  if (m.senderType === "meta" || m.senderType === "visitor") return "Cliente";
  if (m.senderType === "ali") return m.sourceType === "AUTO" ? "Mensaje automático" : "Ali";
  if (m.senderType === "advisor") return "Asesor";
  return null;
}

function lineas(mensajes: MensajeMemoria[], canal: string) {
  return mensajes
    .filter((m) => m.sourceType !== "EVENTO" && !m.text.startsWith("(Respuesta pública"))
    .map((m) => {
      const autor = quien(m);
      if (!autor) return null;
      const via = m.sourceType === "COMMENT" ? " (comentario en una publicación)" : "";
      return `[${fecha(m.createdAt)}, ${canal}] ${autor}${via}: ${corto(m.text)}`;
    })
    .filter((l): l is string => Boolean(l));
}

/**
 * @param conversationId conversación actual
 * @param anteriores mensajes de esta misma conversación que quedaron antes del corte de 24 h
 */
export async function memoriaDelLead(conversationId: string, anteriores: MensajeMemoria[]): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      platform: true,
      leadId: true,
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          source: true,
          status: true,
          etapaDesde: true,
          interests: true,
          notes: true,
          pie: true,
          monthlyPayment: true,
          creditInterest: true,
          visited: true,
          visitDate: true,
          visitProject: true,
          bookingId: true,
          lote: true,
          etapa: true,
          signingStatus: true,
          signingProject: true,
          proximaAccion: true,
          proximaAccionAt: true,
          motivoPerdida: true,
          createdAt: true,
          assignedTo: { select: { name: true } },
          _count: { select: { reservations: true } },
        },
      },
    },
  });
  if (!conv) return null;

  const secciones: string[] = [];
  const lead = conv.lead;

  if (lead) {
    const estado = canonico(lead.status);
    // "visited" se marca al AGENDAR: si llegó o no lo dice visitaRealizada.ts.
    const visita = lead.visitDate ? await estadoDeVisita(lead.id).catch(() => null) : null;
    const TEXTO_VISITA: Record<string, string> = {
      agendada: "Visita agendada",
      por_marcar: "Tenía visita (el asesor no ha marcado si llegó)",
      llego: "Visita realizada (llegó)",
      no_llego: "Tenía visita y NO llegó",
    };
    const ficha = [
      `Lead desde el ${dia(lead.createdAt)}${lead.source ? `, origen ${lead.source}` : ""}.`,
      `Etapa del pipeline: ${nombreEstado(lead.status)}${lead.etapaDesde ? ` (desde el ${dia(lead.etapaDesde)})` : ""}.`,
      ESTADOS_CLIENTE.includes(estado) || lead._count.reservations > 0
        ? "YA ES CLIENTE (tiene una reserva o una compra en curso): lo que pregunte sobre su terreno, pagos, escritura o entrega es postventa y se deriva."
        : null,
      lead.assignedTo?.name ? `Asesor a cargo: ${lead.assignedTo.name}.` : null,
      lead.interests ? `Intereses: ${corto(lead.interests, 200)}.` : null,
      lead.pie ? `Pie que dijo tener: ${corto(lead.pie, 60)}.` : null,
      lead.monthlyPayment ? `Cuota que puede pagar: ${corto(lead.monthlyPayment, 60)}.` : null,
      lead.creditInterest ? `Interés en crédito: ${corto(lead.creditInterest, 60)}.` : null,
      lead.visitDate && visita
        ? `${TEXTO_VISITA[visita.estado] || "Visita agendada"}${lead.visitProject ? ` a ${lead.visitProject}` : ""} el ${fecha(lead.visitDate)}.`
        : null,
      lead.lote ? `Lote de interés: ${corto(lead.lote, 40)}${lead.etapa ? `, etapa ${corto(lead.etapa, 20)}` : ""}.` : null,
      lead.signingStatus ? `Firma: ${corto(lead.signingStatus, 40)}${lead.signingProject ? ` (${lead.signingProject})` : ""}.` : null,
      lead.proximaAccion ? `Próxima acción del asesor: ${corto(lead.proximaAccion, 120)}${lead.proximaAccionAt ? ` (${dia(lead.proximaAccionAt)})` : ""}.` : null,
      lead.motivoPerdida ? `Se marcó como perdido por: ${corto(lead.motivoPerdida, 120)}.` : null,
      lead.notes ? `Notas del CRM: ${corto(lead.notes, 400)}` : null,
    ].filter(Boolean);
    secciones.push(`## Ficha del lead\n${ficha.join("\n")}`);

    // Movimientos del pipeline y seguimientos de los asesores (los 8 más nuevos).
    const eventos: any[] = await prisma.$queryRaw<any[]>`
      SELECT * FROM (
        SELECT h.created_at AS fecha, 'Cambio de etapa' AS tipo,
               concat_ws(' → ', h.de, h.a) || coalesce(' · ' || h.motivo, '') AS detalle
          FROM lead_etapa_historial h WHERE h.lead_id = ${lead.id}
        UNION ALL
        SELECT s.created_at, coalesce(s.tipo, 'Seguimiento'),
               concat_ws(' · ', s.resultado, s.nota)
          FROM lead_seguimientos s
         WHERE s.lead_id = ${lead.id} AND COALESCE(s.resultado, '') <> ${RESULTADO_IA}
      ) e ORDER BY fecha DESC LIMIT 8`.catch(() => []);
    if (eventos.length) {
      secciones.push(
        `## Movimientos recientes\n${eventos
          .reverse()
          .map((e) => `[${dia(new Date(e.fecha))}] ${e.tipo}: ${corto(e.detalle, 160)}`)
          .join("\n")}`
      );
    }

    // Lead score que calcula el CRM web (si ya lo calculó).
    const puntaje: any[] = await prisma.$queryRaw<any[]>`
      SELECT score, banda FROM public.lead_score WHERE lead_id = ${lead.id} LIMIT 1`.catch(() => []);
    if (puntaje[0]) secciones.push(`## Lead score\n${puntaje[0].score} puntos (${puntaje[0].banda}).`);
  }

  // Lo que entendió el calificador IA (Sonnet, CRM web) de sus conversaciones.
  const calificacion = await calificacionDelCrmWeb(lead?.id ?? null, conversationId);
  if (calificacion) secciones.push(`## Lo que ya sabemos de sus conversaciones (calificador IA)\n${calificacion}`);

  // Conversaciones: lo que habló antes en esta misma conversación (antes del
  // último silencio de 24 h) y por otros canales. Van después de la ficha y,
  // si no caben, se recortan sus mensajes más viejos.
  const conversaciones: Array<{ titulo: string; lineas: string[] }> = [];
  const antes = lineas(anteriores, CANAL[conv.platform] || conv.platform).slice(-MAX_MENSAJES_ANTERIORES);
  if (antes.length) conversaciones.push({ titulo: "Conversaciones anteriores en este canal (ya se respondieron)", lineas: antes });

  // Lo que habló por otros canales, si la conversación ya está unida a un lead.
  if (lead) {
    const desde = new Date(Date.now() - DIAS_HISTORIA * 24 * 60 * 60 * 1000);
    const otras = await prisma.conversation.findMany({
      where: { leadId: lead.id, id: { not: conversationId } },
      select: {
        platform: true,
        messages: {
          where: { createdAt: { gte: desde } },
          orderBy: { createdAt: "desc" },
          take: MAX_POR_OTRO_CANAL,
          select: { text: true, senderType: true, sourceType: true, createdAt: true },
        },
      },
    });
    for (const o of otras) {
      const ls = lineas([...o.messages].reverse(), CANAL[o.platform] || o.platform);
      if (ls.length) conversaciones.push({ titulo: `Lo que habló por ${CANAL[o.platform] || o.platform} (ya se respondió)`, lineas: ls });
    }
  }

  // La ficha va entera; las conversaciones se reparten lo que queda del máximo.
  let disponible = MAX_TOTAL - secciones.join("\n\n").length;
  for (const c of conversaciones) {
    const tomadas: string[] = [];
    for (let i = c.lineas.length - 1; i >= 0 && disponible - c.lineas[i].length - 1 > 0; i--) {
      tomadas.unshift(c.lineas[i]);
      disponible -= c.lineas[i].length + 1;
    }
    if (tomadas.length) secciones.push(`## ${c.titulo}\n${tomadas.join("\n")}`);
  }

  return secciones.length ? secciones.join("\n\n") : null;
}
