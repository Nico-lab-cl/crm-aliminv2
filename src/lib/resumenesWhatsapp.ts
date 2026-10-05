import prisma from "./prisma";
import { MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";
import {
  ASESORES_ANUNCIABLES,
  MAX_INTENTOS,
  avisar,
  comoNosConocio,
  leerConfig,
  tipoDeLead,
  type Evento,
} from "./avisosWhatsappLeads";

/**
 * Resumenes de leads al grupo de WhatsApp del equipo.
 *
 *   - Diario, a las 11:00 de Chile, con el dia anterior.
 *   - Semanal, el lunes a las 12:00 de Chile, con la semana lunes-domingo
 *     anterior.
 *
 * Ninguno lleva gasto ni costos: el grupo es del equipo de ventas. Tampoco
 * las conversaciones de las campañas de WhatsApp: se sacaron a pedido, porque
 * leerlas exige un token de Meta con permiso ads_read que el CRM no tiene.
 *
 * Todo sale del CRM:
 *   - Formularios de Meta y web: por el origen del lead. Lo que Meta dice
 *     haber generado no se usa: lo que importa es lo que llego.
 *   - Atencion por asesor: Lead.contacted, que se marca solo cuando el asesor
 *     le escribe al cliente o a mano desde la ficha.
 *
 * Corre en el mismo temporizador que los avisos y usa la misma tabla de
 * registro; la clave de cada resumen es su periodo, asi que nunca sale dos
 * veces aunque el CRM se reinicie a mitad de la mañana.
 */

const HORA_DIARIO = 11;
/** Lunes a mediodia, una hora despues del diario del domingo. */
const HORA_SEMANAL = 12;

const NOMBRE_ASESOR: Record<string, string> = {
  [MARCELA_ID]: "Marcela",
  [ORLANDO_ID]: "Orlando",
  [BARBARA_ID]: "Bárbara",
};

// ---------------------------------------------------------------------------
// Fechas en hora de Chile
// ---------------------------------------------------------------------------

/** Fecha (YYYY-MM-DD), hora y dia de la semana (1 = lunes) en Chile. */
function ahoraEnChile(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(fecha);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value || "";
  const dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    fecha: `${p("year")}-${p("month")}-${p("day")}`,
    hora: Number(p("hour")) % 24,
    diaSemana: dias.indexOf(p("weekday")) + 1,
  };
}

function sumarDias(fecha: string, dias: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** El instante (UTC) en que empieza ese dia en Chile. */
function inicioDelDiaEnChile(fecha: string): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  const comoSiFueraUtc = Date.UTC(a, m - 1, d);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(comoSiFueraUtc));
  const p = (tipo: string) => Number(partes.find((x) => x.type === tipo)?.value);
  const vistoEnChile = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour") % 24, p("minute"));
  // Desfase de Santiago respecto de UTC ese dia (-3h o -4h segun horario de verano).
  return new Date(comoSiFueraUtc - (vistoEnChile - comoSiFueraUtc));
}

function fechaCorta(fecha: string) {
  const [a, m, d] = fecha.split("-");
  return `${d}-${m}-${a}`;
}

const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

// CRM
// ---------------------------------------------------------------------------

type DatosCrm = {
  formularios: number;
  web: number;
  manuales: number;
  comoConocio: [string, number][];
  atencion: { asesor: string; atendidos: number; total: number }[];
};

async function datosCrm(desde: string, hasta: string): Promise<DatosCrm> {
  const leads: any[] = await (prisma as any).lead.findMany({
    where: {
      createdAt: { gte: inicioDelDiaEnChile(desde), lt: inicioDelDiaEnChile(sumarDias(hasta, 1)) },
    },
    select: {
      source: true, formId: true, adId: true, adName: true,
      comoConocio: true, assignedToId: true, contacted: true,
    },
  });

  let formularios = 0;
  let web = 0;
  let manuales = 0;
  const conocio = new Map<string, number>();
  const atencion = new Map<string, { atendidos: number; total: number }>();

  for (const lead of leads) {
    const tipo = tipoDeLead(lead);
    const esManual = !tipo && (lead.source || "").trim().toLowerCase() === "manual";
    if (!tipo && !esManual) continue; // CSV, Newsletter: no son leads que llegaron

    if (tipo === "ANUNCIO") formularios++;
    else if (tipo === "WEB") web++;
    else manuales++;

    if (tipo === "WEB") {
      const como = comoNosConocio(lead.comoConocio);
      if (como) conocio.set(como, (conocio.get(como) || 0) + 1);
    }

    if (ASESORES_ANUNCIABLES.includes(lead.assignedToId)) {
      const a = atencion.get(lead.assignedToId) || { atendidos: 0, total: 0 };
      a.total++;
      if (lead.contacted) a.atendidos++;
      atencion.set(lead.assignedToId, a);
    }
  }

  return {
    formularios,
    web,
    manuales,
    comoConocio: Array.from(conocio.entries()).sort((a, b) => b[1] - a[1]),
    atencion: Array.from(atencion.entries())
      .map(([id, a]) => ({ asesor: NOMBRE_ASESOR[id] || "Otro", ...a }))
      .sort((a, b) => b.total - a.total),
  };
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function textoResumen(titulo: string, crm: DatosCrm): string {
  const l: string[] = [titulo, ""];

  l.push(`📋 *Formulario de Meta*: ${crm.formularios} leads`);

  l.push("", `🌐 *Web*: ${crm.web} leads`);
  if (crm.comoConocio.length) {
    l.push(`   🗣️ Nos conocieron por: ${crm.comoConocio.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(" · ")}`);
  }

  if (crm.manuales) l.push("", `✍️ *Ingresados a mano*: ${crm.manuales}`);

  if (crm.atencion.length) {
    l.push("", "👥 *Leads atendidos por asesor*");
    for (const a of crm.atencion) {
      l.push(`   ${a.asesor}: ${a.atendidos} de ${a.total} (${porcentaje(a.atendidos, a.total)}%)`);
    }
  }

  return l.join("\n");
}

// ---------------------------------------------------------------------------
// Pasada
// ---------------------------------------------------------------------------

/** Si el resumen ya salio (o agoto sus intentos), no se vuelve a armar. */
async function yaResuelto(clave: string, evento: Evento): Promise<boolean> {
  const filas: unknown[] = await prisma.$queryRaw`
    SELECT 1 FROM public.whatsapp_lead_avisos
     WHERE lead_id = ${clave} AND evento = ${evento}
       AND (estado <> 'ERROR' OR intentos >= ${MAX_INTENTOS})`;
  return filas.length > 0;
}

async function armarYEnviar(
  evento: Evento, clave: string, titulo: string, desde: string, hasta: string
) {
  const cfg = leerConfig();
  if (!cfg) return false;

  const crm = await datosCrm(desde, hasta);
  return avisar(clave, evento, null, textoResumen(titulo, crm), cfg);
}

/**
 * Pensada para llamarse cada minuto. Solo arma un resumen cuando le toca y
 * todavia no salio; el resto de las pasadas es una consulta barata o nada.
 *
 * Si el CRM estuvo caido a la hora exacta, el resumen sale en cuanto vuelve
 * (el mismo dia, o el mismo lunes en el caso del semanal).
 */
export async function runResumenesWhatsapp() {
  if (!leerConfig()) return { activo: false, enviados: [] as string[] };

  const ahora = ahoraEnChile();
  const enviados: string[] = [];

  if (ahora.hora >= HORA_DIARIO) {
    const dia = sumarDias(ahora.fecha, -1);
    const clave = `RESUMEN_DIARIO:${dia}`;
    if (!(await yaResuelto(clave, "RESUMEN_DIARIO"))) {
      const titulo = `📊 *Resumen de ayer* · ${fechaCorta(dia)}`;
      if (await armarYEnviar("RESUMEN_DIARIO", clave, titulo, dia, dia)) enviados.push(clave);
    }
  }

  if (ahora.diaSemana === 1 && ahora.hora >= HORA_SEMANAL) {
    const lunes = sumarDias(ahora.fecha, -7);
    const domingo = sumarDias(ahora.fecha, -1);
    const clave = `RESUMEN_SEMANAL:${lunes}`;
    if (!(await yaResuelto(clave, "RESUMEN_SEMANAL"))) {
      const titulo = `📊 *Resumen de la semana* · ${fechaCorta(lunes)} al ${fechaCorta(domingo)}`;
      if (await armarYEnviar("RESUMEN_SEMANAL", clave, titulo, lunes, domingo)) enviados.push(clave);
    }
  }

  return { activo: true, enviados };
}

/**
 * Manda ahora un resumen marcado como prueba, con los mismos datos que tendra
 * el real. Su clave lleva la hora, asi que no ocupa el lugar del resumen real
 * ni impide repetir la prueba.
 */
export async function probarResumen(tipo: "diario" | "semanal") {
  const ahora = ahoraEnChile();
  const ayer = sumarDias(ahora.fecha, -1);

  // El semanal de prueba toma la ultima semana lunes-domingo ya terminada.
  const diasDesdeLunes = (ahora.diaSemana + 6) % 7;
  const lunes = sumarDias(ahora.fecha, -diasDesdeLunes - 7);
  const domingo = sumarDias(lunes, 6);

  const [evento, titulo, desde, hasta]: [Evento, string, string, string] =
    tipo === "diario"
      ? ["RESUMEN_DIARIO", `🧪 *PRUEBA* · 📊 *Resumen de ayer* · ${fechaCorta(ayer)}`, ayer, ayer]
      : ["RESUMEN_SEMANAL", `🧪 *PRUEBA* · 📊 *Resumen de la semana* · ${fechaCorta(lunes)} al ${fechaCorta(domingo)}`, lunes, domingo];

  const clave = `PRUEBA:${evento}:${Date.now()}`;
  return { clave, enviado: await armarYEnviar(evento, clave, titulo, desde, hasta) };
}
