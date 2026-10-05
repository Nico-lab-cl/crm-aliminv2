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
 *   - Diario, a las 11:00 de Chile, con el dia anterior. Sin plata.
 *   - Semanal, el lunes a las 00:00 de Chile, con la semana lunes-domingo
 *     anterior. Incluye el gasto de Meta.
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
/** Lunes a las 00:00: el resumen semanal sale apenas termina la semana. */
const HORA_SEMANAL = 0;

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

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

type DatosMeta = {
  whatsapp: { asesor: string; conversaciones: number; gasto: number }[];
  gastoFormularios: number;
  gastoWeb: number;
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
 * Gasto y conversaciones por conjunto de anuncios en el periodo. Los
 * conjuntos se clasifican por su destino: WHATSAPP, ON_AD (formulario de
 * Meta) o WEBSITE. El resto (alcance, reconocimiento) no entra al resumen.
 */
async function datosMeta(desde: string, hasta: string): Promise<DatosMeta> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) throw new Error("Falta la variable META_ADS_TOKEN");
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
    `${META_API}/act_${cuenta}/insights?level=adset&fields=adset_id,adset_name,spend,actions` +
      `&time_range=${rango}&limit=500&access_token=${t}`
  );

  const porAsesor = new Map<string, { conversaciones: number; gasto: number }>();
  let gastoFormularios = 0;
  let gastoWeb = 0;

  for (const fila of filas) {
    const gasto = Number(fila.spend || 0);
    const conversaciones = Number(
      (fila.actions || []).find(
        (a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d"
      )?.value || 0
    );
    // Si el conjunto ya no aparece en el listado (borrado), se deduce por sus resultados.
    const tipo = destino.get(fila.adset_id) || (conversaciones > 0 ? "WHATSAPP" : "");

    if (tipo === "WHATSAPP") {
      const asesor = asesorDelConjunto(fila.adset_name || "");
      const acumulado = porAsesor.get(asesor) || { conversaciones: 0, gasto: 0 };
      acumulado.conversaciones += conversaciones;
      acumulado.gasto += gasto;
      porAsesor.set(asesor, acumulado);
    } else if (tipo === "ON_AD") {
      gastoFormularios += gasto;
    } else if (tipo === "WEBSITE") {
      gastoWeb += gasto;
    }
  }

  const whatsapp = Array.from(porAsesor.entries())
    .map(([asesor, d]) => ({ asesor, ...d }))
    .sort((a, b) => b.conversaciones - a.conversaciones);

  return { whatsapp, gastoFormularios, gastoWeb };
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

export function textoResumen(
  titulo: string, crm: DatosCrm, meta: DatosMeta | { error: string }, conPlata: boolean
): string {
  const l: string[] = [titulo, ""];

  if ("error" in meta) {
    l.push("💬 *WhatsApp (anuncios)*: sin datos de Meta");
  } else {
    const total = meta.whatsapp.reduce((s, w) => s + w.conversaciones, 0);
    l.push(`💬 *WhatsApp (anuncios)*: ${total} conversaciones`);
    if (conPlata) {
      for (const w of meta.whatsapp) {
        const cu = w.conversaciones ? ` · ${pesos(w.gasto / w.conversaciones)} c/u` : "";
        l.push(`   ${w.asesor}: ${w.conversaciones} · ${pesos(w.gasto)}${cu}`);
      }
    } else if (meta.whatsapp.length) {
      l.push(`   ${meta.whatsapp.map((w) => `${w.asesor} ${w.conversaciones}`).join(" · ")}`);
    }
  }

  l.push("", `📋 *Formulario de Meta*: ${crm.formularios} leads en el CRM`);
  if (conPlata && !("error" in meta) && meta.gastoFormularios > 0) {
    const cu = crm.formularios ? ` · ${pesos(meta.gastoFormularios / crm.formularios)} por lead` : "";
    l.push(`   Gasto: ${pesos(meta.gastoFormularios)}${cu}`);
  }

  l.push("", `🌐 *Web*: ${crm.web} leads en el CRM`);
  if (crm.comoConocio.length) {
    l.push(`   🗣️ Nos conocieron por: ${crm.comoConocio.slice(0, 4).map(([c, n]) => `${c} ${n}`).join(" · ")}`);
  }
  if (conPlata && !("error" in meta) && meta.gastoWeb > 0) {
    const cu = crm.web ? ` · ${pesos(meta.gastoWeb / crm.web)} por lead` : "";
    l.push(`   Gasto en anuncios a la web: ${pesos(meta.gastoWeb)}${cu}`);
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
  evento: Evento, clave: string, titulo: string, desde: string, hasta: string, conPlata: boolean
) {
  const cfg = leerConfig();
  if (!cfg) return false;
  // Permite mandar los resumenes a otro grupo (por ejemplo, uno de gerencia).
  const cfgResumen = { ...cfg, grupo: process.env.LEADS_RESUMEN_GROUP || cfg.grupo };

  const crm = await datosCrm(desde, hasta);
  // Si Meta falla, el resumen sale igual con lo del CRM: es lo que mas importa.
  const meta = await datosMeta(desde, hasta).catch((error) => {
    console.error("[resumenes-whatsapp] No se pudieron leer los datos de Meta:", error);
    return { error: String(error?.message || error) };
  });

  return avisar(clave, evento, null, textoResumen(titulo, crm, meta, conPlata), cfgResumen);
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
      if (await armarYEnviar("RESUMEN_DIARIO", clave, titulo, dia, dia, false)) enviados.push(clave);
    }
  }

  if (ahora.diaSemana === 1 && ahora.hora >= HORA_SEMANAL) {
    const lunes = sumarDias(ahora.fecha, -7);
    const domingo = sumarDias(ahora.fecha, -1);
    const clave = `RESUMEN_SEMANAL:${lunes}`;
    if (!(await yaResuelto(clave, "RESUMEN_SEMANAL"))) {
      const titulo = `📊 *Resumen de la semana* · ${fechaCorta(lunes)} al ${fechaCorta(domingo)}`;
      if (await armarYEnviar("RESUMEN_SEMANAL", clave, titulo, lunes, domingo, true)) enviados.push(clave);
    }
  }

  return { activo: true, enviados };
}
