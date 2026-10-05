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
 * Ninguno lleva gasto ni costos: el grupo es del equipo de ventas.
 *
 * De donde sale cada numero:
 *   - Conversaciones de WhatsApp: de Meta (conjuntos de anuncios con destino
 *     WhatsApp). No hay otra fuente: esas conversaciones caen en el telefono
 *     de cada asesor, no en el CRM. Cada conjunto lleva el nombre del asesor.
 *   - Formularios de Meta y web: del CRM, por el origen del lead. Lo que Meta
 *     dice haber generado no se usa: lo que importa es lo que llego.
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

const META_API = "https://graph.facebook.com/v21.0";
/** Cuenta publicitaria "Alimin Meta". */
const CUENTA_META_POR_DEFECTO = "343467944575694";

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

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

type DatosMeta = {
  whatsapp: { asesor: string; conversaciones: number }[];
};

async function leerTodo(url: string): Promise<any[]> {
  const filas: any[] = [];
  let siguiente: string | null = url;
  // Tope de paginas por las dudas: la cuenta tiene pocas decenas de conjuntos.
  for (let i = 0; siguiente && i < 10; i++) {
    const r: Response = await fetch(siguiente, { signal: AbortSignal.timeout(20000) });
    const cuerpo: any = await r.json();
    if (!r.ok || cuerpo.error) {
      throw new Error(`Meta respondio ${r.status}: ${cuerpo.error?.message || "sin detalle"}`);
    }
    filas.push(...(cuerpo.data || []));
    siguiente = cuerpo.paging?.next || null;
  }
  return filas;
}

/** El asesor sale del nombre del conjunto de anuncios ("... | BARBARA | ..."). */
function asesorDelConjunto(nombre: string): string {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("barbara")) return "Bárbara";
  if (n.includes("orlando")) return "Orlando";
  if (n.includes("marcela")) return "Marcela";
  return "Otros";
}

/**
 * Conversaciones iniciadas por conjunto de anuncios con destino WhatsApp.
 *
 * Usa el mismo token de la app de Meta con que el CRM ya recibe los mensajes
 * (META_PAGE_ACCESS_TOKEN). Para leer la cuenta publicitaria ese token
 * necesita el permiso ads_read; si no lo tiene, Meta responde con error, el
 * resumen sale igual con los datos del CRM y el motivo queda en el log.
 * META_ADS_TOKEN permite usar un token distinto solo para esto.
 */
async function datosMeta(desde: string, hasta: string): Promise<DatosMeta> {
  const token = process.env.META_ADS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("No hay token de Meta (META_PAGE_ACCESS_TOKEN)");
  const cuenta = process.env.META_AD_ACCOUNT_ID || CUENTA_META_POR_DEFECTO;
  const t = encodeURIComponent(token);

  const estados = encodeURIComponent(JSON.stringify([
    "ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES",
  ]));
  const conjuntos = await leerTodo(
    `${META_API}/act_${cuenta}/adsets?fields=id,destination_type&effective_status=${estados}&limit=200&access_token=${t}`
  );
  const destino = new Map<string, string>(conjuntos.map((c) => [c.id, c.destination_type]));

  const rango = encodeURIComponent(JSON.stringify({ since: desde, until: hasta }));
  const filas = await leerTodo(
    `${META_API}/act_${cuenta}/insights?level=adset&fields=adset_id,adset_name,actions` +
      `&time_range=${rango}&limit=500&access_token=${t}`
  );

  const porAsesor = new Map<string, number>();

  for (const fila of filas) {
    const conversaciones = Number(
      (fila.actions || []).find(
        (a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d"
      )?.value || 0
    );
    // Si el conjunto ya no aparece en el listado (borrado), se deduce por sus resultados.
    const tipo = destino.get(fila.adset_id) || (conversaciones > 0 ? "WHATSAPP" : "");

    if (tipo === "WHATSAPP") {
      const asesor = asesorDelConjunto(fila.adset_name || "");
      porAsesor.set(asesor, (porAsesor.get(asesor) || 0) + conversaciones);
    }
  }

  const whatsapp = Array.from(porAsesor.entries())
    .map(([asesor, conversaciones]) => ({ asesor, conversaciones }))
    .sort((a, b) => b.conversaciones - a.conversaciones);

  return { whatsapp };
}

// ---------------------------------------------------------------------------
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

export function textoResumen(titulo: string, crm: DatosCrm, meta: DatosMeta | { error: string }): string {
  const l: string[] = [titulo, ""];

  if ("error" in meta) {
    l.push("💬 *WhatsApp (anuncios)*: sin datos de Meta");
  } else {
    const total = meta.whatsapp.reduce((s, w) => s + w.conversaciones, 0);
    l.push(`💬 *WhatsApp (anuncios)*: ${total} conversaciones`);
    if (meta.whatsapp.length) {
      l.push(`   ${meta.whatsapp.map((w) => `${w.asesor} ${w.conversaciones}`).join(" · ")}`);
    }
  }

  l.push("", `📋 *Formulario de Meta*: ${crm.formularios} leads`);

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
  // Si Meta falla, el resumen sale igual con lo del CRM: es lo que mas importa.
  const meta = await datosMeta(desde, hasta).catch((error) => {
    console.error("[resumenes-whatsapp] No se pudieron leer los datos de Meta:", error);
    return { error: String(error?.message || error) };
  });

  return avisar(clave, evento, null, textoResumen(titulo, crm, meta), cfg);
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
