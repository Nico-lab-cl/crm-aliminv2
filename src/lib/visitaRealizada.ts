import prisma from "./prisma";
import { createNotification } from "./notifications";
import { registrarSeguimiento } from "./pipeline";

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
 * nueva). Si en 24 h después de la hora de la visita no marcó nada, se asume
 * que llegó.
 */

export const RESULTADO_LLEGO = "Llegó a la visita";
export const RESULTADO_NO_LLEGO = "No llegó a la visita";
/** Sin marca en este rato después de la hora de la visita, se asume que llegó. */
const HORAS_PARA_ASUMIR = 24;
/** El push para marcarlo sale este rato después de la hora de la visita. */
const HORAS_PARA_PREGUNTAR = 2;
/** Una marca cuenta para la visita si se hizo desde este rato antes de su hora (por si la marcan al llegar). */
const MARGEN_ANTES_HORAS = 3;

export type EstadoVisita =
  | "sin_visita" // nunca agendó
  | "agendada" // la visita todavía no ocurre
  | "por_marcar" // ya pasó la hora y el asesor no marcó (todavía no se asume)
  | "llego"
  | "no_llego"
  | "asumida"; // pasaron 24 h sin marca: se asume que llegó

export interface Visita {
  estado: EstadoVisita;
  fecha: Date | null;
  proyecto: string | null;
}

/** Llegó o se asume que llegó. */
export const visitaRealizada = (v: Visita) => v.estado === "llego" || v.estado === "asumida";

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

  const horas = (ahora - fecha.getTime()) / (60 * 60 * 1000);
  return { estado: horas >= HORAS_PARA_ASUMIR ? "asumida" : "por_marcar", ...base };
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
  return estadoDeVisita(leadId);
}

/**
 * Push al asesor 2 h después de la hora de la visita para que marque si
 * llegó. Una vez por visita (se revisa en Notification). Corre cada 10 min.
 */
export async function preguntarVisitasPasadas() {
  const ahora = Date.now();
  const leads = await prisma.lead.findMany({
    where: {
      visitDate: {
        lte: new Date(ahora - HORAS_PARA_PREGUNTAR * 60 * 60 * 1000),
        gte: new Date(ahora - HORAS_PARA_ASUMIR * 60 * 60 * 1000),
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
    const yaPregunto = await prisma.notification.findFirst({
      where: { leadId: l.id, type: "VISITA_RESULTADO", createdAt: { gte: l.visitDate } },
      select: { id: true },
    });
    if (yaPregunto) continue;
    const v = await estadoDeVisita(l.id);
    if (v.estado !== "por_marcar") continue;
    await createNotification({
      userId: l.assignedToId,
      title: "¿Llegó a la visita?",
      body: `Marca si ${l.firstName || "el cliente"} llegó a la visita${l.visitProject ? ` a ${l.visitProject}` : ""}. Con eso la IA de Cierre sabe si hacer el seguimiento.`,
      leadId: l.id,
      type: "VISITA_RESULTADO",
    });
    n++;
  }
  return n;
}
