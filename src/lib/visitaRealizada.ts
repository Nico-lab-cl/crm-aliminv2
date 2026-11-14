import prisma from "./prisma";
import { createNotification } from "./notifications";
import { registrarSeguimiento } from "./pipeline";
import { oficinaDice } from "./oficina";

/**
 * ¿La persona llegó a la visita? (Nicolás, 12-11-2026)
 *
 * "visited" en Lead se marca al AGENDAR la visita, no al hacerla: el CRM no
 * sabía si la persona fue. La IA de Cierre toma al cliente después de la
 * visita, así que hace falta el dato real (y de paso da la métrica de visitas
 * realizadas).
 *
 * El asesor lo marca en la ficha con "Llegó" o "No llegó". Queda como
 * seguimiento de tipo VISITA en lead_seguimientos (no hace falta columna
 * nueva). Sin marca NO se asume nada (Nicolás, 14-11-2026: "mejor que no
 * asuma"): la IA de Cierre y los correos post-visita solo toman a quien el
 * asesor marcó "Llegó". Por eso el push se repite una vez si no marca.
 */

export const RESULTADO_LLEGO = "Llegó a la visita";
export const RESULTADO_NO_LLEGO = "No llegó a la visita";
/** El primer push para marcarlo sale este rato después de la hora de la visita. */
const HORAS_PARA_PREGUNTAR = 2;
/** Si sigue sin marcar, el segundo push sale a este rato de la visita. */
const HORAS_SEGUNDO_AVISO = 24;
/** Después de esto ya no se insiste. */
const HORAS_DEJAR_DE_PREGUNTAR = 72;
/** Una marca cuenta para la visita si se hizo desde este rato antes de su hora (por si la marcan al llegar). */
const MARGEN_ANTES_HORAS = 3;

export type EstadoVisita =
  | "sin_visita" // nunca agendó
  | "agendada" // la visita todavía no ocurre
  | "por_marcar" // ya pasó la hora y el asesor no marcó
  | "llego"
  | "no_llego";

export interface Visita {
  estado: EstadoVisita;
  fecha: Date | null;
  proyecto: string | null;
}

/** Solo si el asesor marcó que llegó. */
export const visitaRealizada = (v: Visita) => v.estado === "llego";

export async function estadoDeVisita(leadId: string): Promise<Visita> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { visitDate: true, visitProject: true, bookingId: true },
  });
  if (!lead?.visitDate) return { estado: "sin_visita", fecha: null, proyecto: lead?.visitProject ?? null };

  const fecha = lead.visitDate;
  const base = { fecha, proyecto: lead.visitProject ?? null };
  const ahora = Date.now();
  if (fecha.getTime() > ahora) return { estado: "agendada", ...base };

  const desde = new Date(fecha.getTime() - MARGEN_ANTES_HORAS * 60 * 60 * 1000);
  const marcas = await prisma.$queryRaw<{ resultado: string }[]>`
    SELECT resultado FROM lead_seguimientos
     WHERE lead_id = ${leadId} AND tipo = 'VISITA'
       AND resultado IN (${RESULTADO_LLEGO}, ${RESULTADO_NO_LLEGO})
       AND created_at >= ${desde}
     ORDER BY created_at DESC LIMIT 1`;
  if (marcas[0]) return { estado: marcas[0].resultado === RESULTADO_LLEGO ? "llego" : "no_llego", ...base };
  return { estado: "por_marcar", ...base };
}

/** El asesor marca si llegó. Queda en el historial a su nombre. */
export async function marcarVisita(leadId: string, usuario: { id: string; role?: string }, llego: boolean) {
  const visita = await estadoDeVisita(leadId);
  const cuando = visita.fecha
    ? visita.fecha.toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  await registrarSeguimiento(leadId, usuario, {
    tipo: "VISITA",
    resultado: llego ? RESULTADO_LLEGO : RESULTADO_NO_LLEGO,
    nota: [visita.proyecto, cuando ? `visita del ${cuando}` : null].filter(Boolean).join(", ") || null,
  });
  if (llego) oficinaDice("cierre", `¡Llegó a la visita${visita.proyecto ? ` a ${visita.proyecto}` : ""}! Me toca`);
  else oficinaDice("ali", "No llegó a la visita: lo intento reagendar");
  return estadoDeVisita(leadId);
}

/**
 * Push al asesor 2 h después de la hora de la visita para que marque si
 * llegó, y uno más a las 24 h si sigue sin marcar (sin la marca, la IA de
 * Cierre y los correos post-visita no la toman). Se cuentan los avisos en
 * Notification. Corre cada 10 min.
 */
export async function preguntarVisitasPasadas() {
  const ahora = Date.now();
  const leads = await prisma.lead.findMany({
    where: {
      visitDate: {
        lte: new Date(ahora - HORAS_PARA_PREGUNTAR * 60 * 60 * 1000),
        gte: new Date(ahora - HORAS_DEJAR_DE_PREGUNTAR * 60 * 60 * 1000),
      },
      assignedToId: { not: null },
      status: { notIn: ["PERDIDO", "RESERVADO", "RESERVA_POR_FIRMAR", "RESERVA_PAGADA", "PIE_POR_PAGAR", "PAGO_CUOTAS", "VENTA_CERRADA"] },
    },
    select: { id: true, firstName: true, visitDate: true, visitProject: true, assignedToId: true },
    take: 50,
  });

  let n = 0;
  for (const l of leads) {
    if (!l.visitDate || !l.assignedToId) continue;
    const avisos = await prisma.notification.count({
      where: { leadId: l.id, type: "VISITA_RESULTADO", createdAt: { gte: l.visitDate } },
    });
    const horas = (ahora - l.visitDate.getTime()) / (60 * 60 * 1000);
    const toca = avisos === 0 || (avisos === 1 && horas >= HORAS_SEGUNDO_AVISO);
    if (!toca) continue;
    const v = await estadoDeVisita(l.id);
    if (v.estado !== "por_marcar") continue;
    const quien = l.firstName || "el cliente";
    await createNotification({
      userId: l.assignedToId,
      title: avisos === 0 ? "¿Llegó a la visita?" : "Falta marcar la visita",
      body: `Marca si ${quien} llegó a la visita${l.visitProject ? ` a ${l.visitProject}` : ""}. Sin esa marca la IA de Cierre no le hace seguimiento ni le llegan los correos post-visita.`,
      leadId: l.id,
      type: "VISITA_RESULTADO",
    });
    n++;
  }
  return n;
}
