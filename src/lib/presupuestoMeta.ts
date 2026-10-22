import prisma from "./prisma";
import { avisar, leerConfig } from "./avisosWhatsappLeads";
import {
  CUENTA_META_POR_DEFECTO,
  META_API,
  ahoraEnChile,
  fechaCorta,
  inicioDelDiaEnChile,
  leerTodo,
  sumarDias,
} from "./resumenesWhatsapp";

/**
 * Analisis semanal del presupuesto de Meta, por WhatsApp al grupo de
 * marketing "MKT | Alimin" (o a PRESUPUESTO_META_PARA). Nunca al grupo de
 * leads: ese es del equipo de ventas y no lleva plata.
 *
 * Sale el lunes desde las 10:00 de Chile, con la semana lunes-domingo
 * anterior comparada con la semana previa, y en los dias de ESPECIALES con
 * otro periodo (comparado con el periodo previo del mismo largo). Lleva:
 *   - Gasto, contactos y costo por contacto de la cuenta, y el ritmo de gasto
 *     (presupuestos diarios activos proyectados al mes).
 *   - Por campaña: gasto, resultados segun Meta y costo por resultado, y la
 *     calidad segun el CRM: leads que llegaron de verdad, calientes (lead
 *     score), atendidos y avanzaron (visita o reserva).
 *   - Hasta 3 acciones sobre anuncios: pausar, renovar o darle mas.
 *
 * Los WhatsApp de anuncios no llegan al CRM (caen en el telefono del asesor),
 * asi que esa campaña no tiene linea de CRM.
 *
 * Usa el token de anuncios (META_ADS_TOKEN). Sin token, no corre.
 */

const HORA_ENVIO = 10;
const DIA = 86_400_000;

type TipoResultado = "CONVERSACION" | "FORMULARIO" | "LEAD_WEB" | "ALCANCE" | "OTRO";

const ACCION_DE: Record<Exclude<TipoResultado, "ALCANCE" | "OTRO">, string[]> = {
  CONVERSACION: ["onsite_conversion.messaging_conversation_started_7d"],
  FORMULARIO: ["onsite_conversion.lead_grouped", "leadgen_grouped", "lead"],
  LEAD_WEB: ["offsite_conversion.fb_pixel_lead"],
};

const ETIQUETA: Record<TipoResultado, { emoji: string; unidad: string }> = {
  CONVERSACION: { emoji: "💬", unidad: "conv" },
  FORMULARIO: { emoji: "📋", unidad: "leads" },
  LEAD_WEB: { emoji: "🌐", unidad: "leads web" },
  ALCANCE: { emoji: "📣", unidad: "" },
  OTRO: { emoji: "▫️", unidad: "" },
};

function tipoDeObjetivo(objetivo: string | undefined): TipoResultado {
  switch (objetivo) {
    case "CONVERSATIONS":
      return "CONVERSACION";
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return "FORMULARIO";
    case "OFFSITE_CONVERSIONS":
      return "LEAD_WEB";
    case "REACH":
    case "IMPRESSIONS":
    case "AD_RECALL_LIFT":
      return "ALCANCE";
    default:
      return "OTRO";
  }
}

const esContacto = (t: TipoResultado) => t === "CONVERSACION" || t === "FORMULARIO" || t === "LEAD_WEB";

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

type FilaAnuncio = {
  campanaId: string;
  campana: string;
  conjuntoId: string;
  anuncioId: string;
  anuncio: string;
  tipo: TipoResultado;
  gasto: number;
  resultados: number;
  impresiones: number;
  clics: number;
  frecuencia: number;
};

function resultadosDe(actions: any[] | undefined, tipo: TipoResultado): number {
  if (!esContacto(tipo)) return 0;
  for (const nombre of ACCION_DE[tipo as keyof typeof ACCION_DE]) {
    const a = (actions || []).find((x: any) => x.action_type === nombre);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

async function insightsPorAnuncio(
  cuenta: string, t: string, desde: string, hasta: string, objetivoDe: Map<string, string>
): Promise<FilaAnuncio[]> {
  const rango = encodeURIComponent(JSON.stringify({ since: desde, until: hasta }));
  const filas = await leerTodo(
    `${META_API}/act_${cuenta}/insights?level=ad&time_range=${rango}&limit=500` +
      `&fields=campaign_id,campaign_name,adset_id,ad_id,ad_name,spend,impressions,frequency,inline_link_clicks,actions` +
      `&access_token=${t}`
  );
  return filas.map((f) => {
    const tipo = tipoDeObjetivo(objetivoDe.get(f.adset_id));
    return {
      campanaId: f.campaign_id,
      campana: f.campaign_name || "",
      conjuntoId: f.adset_id,
      anuncioId: f.ad_id,
      anuncio: f.ad_name || "",
      tipo,
      gasto: Number(f.spend) || 0,
      resultados: resultadosDe(f.actions, tipo),
      impresiones: Number(f.impressions) || 0,
      clics: Number(f.inline_link_clicks) || 0,
      frecuencia: Number(f.frequency) || 0,
    };
  });
}

/** Dias del periodo, ambos incluidos. */
function diasDelPeriodo(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA) + 1;
}

type DatosMeta = {
  semana: FilaAnuncio[];
  anterior: FilaAnuncio[];
  desdeAnterior: string;
  hastaAnterior: string;
  alcance: Map<string, number>;
  presupuestoDiario: number;
  creadoEl: Map<string, Date>;
};

async function leerMeta(desde: string, hasta: string): Promise<DatosMeta> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) throw new Error("Falta META_ADS_TOKEN");
  const cuenta = process.env.META_AD_ACCOUNT_ID || CUENTA_META_POR_DEFECTO;
  const t = encodeURIComponent(token);
  const todos = encodeURIComponent(JSON.stringify([
    "ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES",
  ]));
  const activos = encodeURIComponent(JSON.stringify(["ACTIVE"]));

  const [conjuntos, campanas, anuncios] = await Promise.all([
    leerTodo(`${META_API}/act_${cuenta}/adsets?fields=id,optimization_goal,daily_budget,effective_status&effective_status=${todos}&limit=200&access_token=${t}`),
    leerTodo(`${META_API}/act_${cuenta}/campaigns?fields=id,daily_budget,effective_status&effective_status=${activos}&limit=100&access_token=${t}`),
    leerTodo(`${META_API}/act_${cuenta}/ads?fields=id,created_time&effective_status=${activos}&limit=500&access_token=${t}`),
  ]);

  const objetivoDe = new Map<string, string>(conjuntos.map((c) => [c.id, c.optimization_goal]));
  // Presupuesto por conjunto o por campaña (si la campaña reparte sola).
  const presupuestoDiario =
    conjuntos.filter((c) => c.effective_status === "ACTIVE").reduce((s, c) => s + (Number(c.daily_budget) || 0), 0) +
    campanas.reduce((s, c) => s + (Number(c.daily_budget) || 0), 0);

  // Se compara con el periodo anterior del mismo largo (la semana previa, o
  // los 10 dias previos si el periodo es de 10 dias).
  const dias = diasDelPeriodo(desde, hasta);
  const desdeAnterior = sumarDias(desde, -dias);
  const hastaAnterior = sumarDias(desde, -1);
  const rango = encodeURIComponent(JSON.stringify({ since: desde, until: hasta }));

  const [semana, anterior, porCampana] = await Promise.all([
    insightsPorAnuncio(cuenta, t, desde, hasta, objetivoDe),
    insightsPorAnuncio(cuenta, t, desdeAnterior, hastaAnterior, objetivoDe),
    // El alcance no se puede sumar por anuncio (la misma persona cuenta varias veces).
    leerTodo(`${META_API}/act_${cuenta}/insights?level=campaign&time_range=${rango}&fields=campaign_id,reach&limit=100&access_token=${t}`),
  ]);

  return {
    semana,
    anterior,
    desdeAnterior,
    hastaAnterior,
    alcance: new Map(porCampana.map((f) => [f.campaign_id, Number(f.reach) || 0])),
    presupuestoDiario,
    creadoEl: new Map(anuncios.map((a) => [a.id, new Date(a.created_time)])),
  };
}

// ---------------------------------------------------------------------------
// Calidad segun el CRM
// ---------------------------------------------------------------------------

type Calidad = { leads: number; calientes: number; atendidos: number; avanzaron: number };

const normalizar = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const minus = (s: string | null | undefined) => (s || "").trim().toLowerCase();

/** Mismo criterio que el lead score: formulario de Meta o landing de Meta con utm pagado. */
function esDeMeta(l: any): boolean {
  if (minus(l.source) === "meta" || l.formId || l.adId) return true;
  const utm = minus(l.utmSource);
  const pagado = /paid|cpc|ppc|cpm|ads?\b|pago/.test(minus(l.utmMedium));
  const utmMeta = /^(fb|ig|meta)$|facebook|instagram/.test(utm);
  return /- ?meta\b/i.test(l.interests || "") || utm === "meta" || (utmMeta && pagado);
}

/**
 * Leads del CRM creados en la semana, por campaña de Meta. La campaña sale
 * del anuncio (adId, formularios) o de los utm de la web, comparados con los
 * ids y nombres de campaña, conjunto y anuncio que devuelve Meta.
 * Lo que no calza va a "sin identificar".
 */
async function calidadPorCampana(desde: string, hasta: string, meta: DatosMeta) {
  const leads: any[] = await (prisma as any).lead.findMany({
    where: { createdAt: { gte: inicioDelDiaEnChile(desde), lt: inicioDelDiaEnChile(sumarDias(hasta, 1)) } },
    select: {
      id: true, source: true, formId: true, adId: true, interests: true,
      utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
      contacted: true, visited: true, status: true,
    },
  });
  const deMeta = leads.filter(esDeMeta);

  // Ids y nombres conocidos -> campaña.
  const porId = new Map<string, string>();
  const porNombre = new Map<string, string>();
  for (const f of [...meta.semana, ...meta.anterior]) {
    porId.set(f.anuncioId, f.campanaId);
    porId.set(f.conjuntoId, f.campanaId);
    porId.set(f.campanaId, f.campanaId);
    porNombre.set(normalizar(f.campana), f.campanaId);
  }

  const campanaDe = (l: any): string | null => {
    if (l.adId && porId.has(l.adId)) return porId.get(l.adId)!;
    for (const valor of [l.utmCampaign, l.utmContent, l.utmTerm]) {
      if (!valor) continue;
      if (porId.has(valor.trim())) return porId.get(valor.trim())!;
      const n = normalizar(valor);
      if (n && porNombre.has(n)) return porNombre.get(n)!;
    }
    return null;
  };

  // Calientes: tabla del lead score (la mantiene el CRM web). Si no existe, 0.
  const calientes = new Set<string>();
  const ids = deMeta.map((l) => l.id);
  if (ids.length) {
    const existe: { t: string | null }[] = await prisma.$queryRaw`SELECT to_regclass('public.lead_score')::text AS t`;
    if (existe[0]?.t) {
      const filas: { lead_id: string }[] = await prisma.$queryRaw`
        SELECT lead_id FROM public.lead_score WHERE banda = 'CALIENTE' AND lead_id = ANY(${ids})`;
      for (const f of filas) calientes.add(f.lead_id);
    }
  }

  const calidad = new Map<string, Calidad>();
  for (const l of deMeta) {
    const clave = campanaDe(l) || "SIN_IDENTIFICAR";
    const c = calidad.get(clave) || { leads: 0, calientes: 0, atendidos: 0, avanzaron: 0 };
    c.leads++;
    if (calientes.has(l.id)) c.calientes++;
    if (l.contacted) c.atendidos++;
    if (l.visited || ["VISITA", "RESERVADO"].includes((l.status || "").toUpperCase())) c.avanzaron++;
    calidad.set(clave, c);
  }
  return calidad;
}

// ---------------------------------------------------------------------------
// Analisis
// ---------------------------------------------------------------------------

type Campana = {
  id: string;
  nombre: string;
  tipo: TipoResultado;
  gasto: number;
  resultados: number;
  costo: number | null;
  costoAntes: number | null;
};

function agruparCampanas(filas: FilaAnuncio[]): Map<string, Campana> {
  const m = new Map<string, Campana & { gastoPorTipo: Map<TipoResultado, number> }>();
  for (const f of filas) {
    const c = m.get(f.campanaId) || {
      id: f.campanaId, nombre: f.campana, tipo: "OTRO" as TipoResultado, gasto: 0, resultados: 0,
      costo: null, costoAntes: null, gastoPorTipo: new Map(),
    };
    c.gasto += f.gasto;
    c.resultados += f.resultados;
    c.gastoPorTipo.set(f.tipo, (c.gastoPorTipo.get(f.tipo) || 0) + f.gasto);
    m.set(f.campanaId, c);
  }
  for (const c of Array.from(m.values())) {
    // El tipo de la campaña es el de los conjuntos donde mas se gasto.
    c.tipo = Array.from(c.gastoPorTipo.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "OTRO";
    c.costo = esContacto(c.tipo) && c.resultados > 0 ? c.gasto / c.resultados : null;
  }
  return m;
}

/** Nombre corto: sin la fecha del comienzo ("● 25-09-26 | ") y sin notas entre parentesis. */
function corto(nombre: string, maximo = 38): string {
  const limpio = nombre
    .replace(/^[●•\s]+/, "")
    .replace(/^\d{2}-\d{2}-\d{2}\s*\|\s*/, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*→.*$/, "")
    .trim();
  return limpio.length > maximo ? limpio.slice(0, maximo - 1) + "…" : limpio;
}

/** Campaña: solo el primer tramo del nombre ("WhatsApp", "Remarketing", "Leads"). */
const nombreCampana = (nombre: string) => corto(corto(nombre, 200).split("|")[0], 26);

const esRemarketing = (campana: string) => /remarketing|remk|tibios/i.test(campana);

type Accion = { prioridad: number; peso: number; texto: string };

/**
 * Reglas, por anuncio, solo con gasto suficiente para no juzgar con 1 o 2
 * resultados:
 *   - Pausar: cuesta mas de 2,5 veces su campaña, o gasto 3 resultados de su
 *     campaña sin traer ninguno.
 *   - Renovar (cansado): costo +25% y clics -10% respecto del periodo
 *     anterior, o frecuencia sobre 3 por semana (5 en remarketing),
 *     proporcional al largo del periodo.
 *   - Darle mas: cuesta menos del 75% de su campaña, con 5 resultados o mas.
 */
function acciones(meta: DatosMeta, campanas: Map<string, Campana>, desde: string, hasta: string): string[] {
  const antes = new Map(meta.anterior.map((f) => [f.anuncioId, f]));
  const lista: Accion[] = [];
  const fin = inicioDelDiaEnChile(sumarDias(hasta, 1)).getTime();
  const semanas = Math.max(1, diasDelPeriodo(desde, hasta) / 7);

  for (const f of meta.semana) {
    if (!esContacto(f.tipo) || f.gasto < 5000) continue;
    const campana = campanas.get(f.campanaId);
    if (!campana?.costo) continue;
    const costo = f.resultados ? f.gasto / f.resultados : null;
    const nombre = `"${corto(f.anuncio)}"`;

    if ((costo && costo > 2.5 * campana.costo) || (!costo && f.gasto >= 3 * campana.costo)) {
      const detalle = costo ? `${pesos(costo)} c/u, ${(costo / campana.costo).toFixed(1).replace(".", ",")} veces su campaña` : `${pesos(f.gasto)} sin resultados`;
      lista.push({ prioridad: 0, peso: f.gasto, texto: `Pausar ${nombre}: ${detalle}.` });
      continue;
    }

    const previo = antes.get(f.anuncioId);
    const ctr = f.impresiones ? f.clics / f.impresiones : 0;
    const limiteFrecuencia = (esRemarketing(f.campana) ? 5 : 3) * semanas;
    if (costo && previo && previo.resultados >= 3 && previo.gasto >= 5000 && previo.impresiones) {
      const costoPrevio = previo.gasto / previo.resultados;
      const ctrPrevio = previo.clics / previo.impresiones;
      const subeCosto = costo >= 1.25 * costoPrevio;
      const bajanClics = ctrPrevio > 0 && ctr <= 0.9 * ctrPrevio;
      if ((subeCosto && bajanClics) || f.frecuencia > limiteFrecuencia) {
        const creado = meta.creadoEl.get(f.anuncioId);
        const semanas = creado ? Math.max(1, Math.round((fin - creado.getTime()) / (7 * DIA))) : null;
        const partes = [
          semanas ? `${semanas} semana${semanas === 1 ? "" : "s"} al aire` : null,
          bajanClics ? `clics ${Math.round((ctr / ctrPrevio - 1) * 100)}%` : null,
          subeCosto ? `costo +${Math.round((costo / costoPrevio - 1) * 100)}%` : null,
          f.frecuencia > limiteFrecuencia ? `frecuencia ${f.frecuencia.toFixed(1).replace(".", ",")}` : null,
        ].filter(Boolean);
        lista.push({ prioridad: 1, peso: f.gasto, texto: `Renovar ${nombre}: ${partes.join(", ")}. Se está cansando.` });
        continue;
      }
    }

    if (costo && f.resultados >= 5 && costo < 0.75 * campana.costo) {
      lista.push({
        prioridad: 2, peso: f.resultados,
        texto: `Darle más a ${nombre}: ${f.resultados} ${ETIQUETA[f.tipo].unidad} a ${pesos(costo)}, su campaña va en ${pesos(campana.costo)}.`,
      });
    }
  }

  return lista.sort((a, b) => a.prioridad - b.prioridad || b.peso - a.peso).slice(0, 3).map((a) => a.texto);
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const miles = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(".", ",")} M` : `$${Math.round(n / 1000)} mil`;
const diaMes = (fecha: string) => fechaCorta(fecha).slice(0, 5);

/** Variacion del costo, su color y que se sugiere hacer con la campaña. */
function variacion(ahora: number | null, antes: number | null): { texto: string; color: string; sugerencia: string } {
  if (!ahora) return { texto: "", color: "", sugerencia: "" };
  if (!antes) return { texto: " nueva", color: " 🟡", sugerencia: " (en aprendizaje: esperar)" };
  const p = Math.round((ahora / antes - 1) * 100);
  const texto = p === 0 ? " igual" : ` ${p > 0 ? "↑" : "↓"}${Math.abs(p)}%`;
  if (p >= 25) return { texto, color: " 🔴", sugerencia: " (sube el costo: renovar anuncios)" };
  if (p >= 10) return { texto, color: " 🟡", sugerencia: " (sube un poco: vigilar)" };
  return { texto, color: " 🟢", sugerencia: p < 0 ? " (más barata: mantener)" : " (estable: mantener)" };
}

export async function textoPresupuesto(desde: string, hasta: string, titulo: string): Promise<string> {
  const meta = await leerMeta(desde, hasta);
  const calidad = await calidadPorCampana(desde, hasta, meta);
  const campanas = agruparCampanas(meta.semana);
  const previas = agruparCampanas(meta.anterior);
  for (const c of Array.from(campanas.values())) c.costoAntes = previas.get(c.id)?.costo ?? null;

  const lista = Array.from(campanas.values()).filter((c) => c.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  const gasto = lista.reduce((s, c) => s + c.gasto, 0);
  const contactos = lista.filter((c) => esContacto(c.tipo)).reduce((s, c) => s + c.resultados, 0);
  const listaPrev = Array.from(previas.values());
  const gastoPrev = listaPrev.reduce((s, c) => s + c.gasto, 0);
  const contactosPrev = listaPrev.filter((c) => esContacto(c.tipo)).reduce((s, c) => s + c.resultados, 0);

  const costo = contactos ? gasto / contactos : null;
  const costoPrev = contactosPrev ? gastoPrev / contactosPrev : null;
  const vGasto = gastoPrev ? Math.round((gasto / gastoPrev - 1) * 100) : null;
  const vCosto = variacion(costo, costoPrev);

  const l: string[] = [titulo, `_Comparado con el ${diaMes(meta.desdeAnterior)} al ${diaMes(meta.hastaAnterior)}_`, ""];
  l.push(
    `Gasto ${pesos(gasto)}${vGasto === null ? "" : ` (${vGasto >= 0 ? "+" : ""}${vGasto}%)`} · ${contactos} contactos · *${costo ? pesos(costo) : "—"} por contacto*${vCosto.texto}`
  );
  if (meta.presupuestoDiario) {
    l.push(`Ritmo: ${pesos(meta.presupuestoDiario)}/día → ~${miles(meta.presupuestoDiario * 30.4)}/mes`);
  }
  l.push("");

  for (const c of lista) {
    const e = ETIQUETA[c.tipo];
    if (c.tipo === "ALCANCE") {
      const alcance = meta.alcance.get(c.id) || 0;
      l.push(`${e.emoji} ${nombreCampana(c.nombre)} · ${miles(c.gasto)} · ${miles(alcance).replace("$", "")} personas`);
      continue;
    }
    const v = variacion(c.costo, c.costoAntes);
    const resultado = esContacto(c.tipo)
      ? ` · ${c.resultados} ${e.unidad} · *${c.costo ? pesos(c.costo) : "—"}*${v.texto}${v.color}${v.sugerencia}`
      : "";
    l.push(`${e.emoji} ${nombreCampana(c.nombre)} · ${miles(c.gasto)}${resultado}`);

    const q = calidad.get(c.id);
    if (q && q.leads) {
      l.push(`   🎯 CRM: ${q.leads} leads (${pesos(c.gasto / q.leads)} c/u) · ${q.calientes} 🔥 · ${q.atendidos} atendidos · ${q.avanzaron} avanzaron`);
    }
  }
  const sinCampana = calidad.get("SIN_IDENTIFICAR");
  if (sinCampana?.leads) {
    l.push(`🎯 Leads de Meta sin campaña identificada: ${sinCampana.leads} · ${sinCampana.calientes} 🔥 · ${sinCampana.avanzaron} avanzaron`);
  }

  // Reparto: la campaña que mas gasta y la que peor rinde para lo que gasta.
  const conContactos = lista.filter((c) => esContacto(c.tipo));
  if (gasto && contactos && conContactos.length > 1) {
    const reparto = (c: Campana) => ({
      c, gasto: Math.round((c.gasto / gasto) * 100), contactos: Math.round((c.resultados / contactos) * 100),
    });
    const mayor = reparto(conContactos[0]);
    const peor = conContactos.map(reparto).filter((r) => r.gasto >= 5).sort((a, b) => (a.contactos / a.gasto) - (b.contactos / b.gasto))[0];
    let linea = `⚖️ ${nombreCampana(mayor.c.nombre)} usa el ${mayor.gasto}% del gasto y trae el ${mayor.contactos}% de los contactos.`;
    if (peor && peor.c.id !== mayor.c.id && peor.contactos < peor.gasto) {
      linea += ` ${nombreCampana(peor.c.nombre)}: ${peor.gasto}% del gasto, ${peor.contactos}% de los contactos.`;
    }
    l.push("", linea);
  }

  const pendientes = acciones(meta, campanas, desde, hasta);
  if (pendientes.length) {
    l.push("", "✅ *Qué hacer ahora*");
    pendientes.forEach((a, i) => l.push(`${i + 1}. ${a}`));
  }

  return l.join("\n");
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

/** Grupo "MKT | Alimin". PRESUPUESTO_META_PARA lo reemplaza (otro grupo o un numero). */
const DESTINO_POR_DEFECTO = "120363386493353789@g.us";

/**
 * Envios unicos fuera del lunes. El del 22-10-2026 fue el primero: 12 al 21
 * de octubre, a las 10:00. Solo sale ese mismo dia, para que un despliegue
 * tardio no lo mande despues.
 */
const ESPECIALES = [{ dia: "2026-10-22", desde: "2026-10-12", hasta: "2026-10-21" }];

function semanaAnterior() {
  const ahora = ahoraEnChile();
  const diasDesdeLunes = (ahora.diaSemana + 6) % 7;
  const lunes = sumarDias(ahora.fecha, -diasDesdeLunes - 7);
  return { ahora, lunes, domingo: sumarDias(lunes, 6) };
}

const tituloSemana = (lunes: string, domingo: string) => `💰 *Meta · semana ${diaMes(lunes)} al ${diaMes(domingo)}*`;
const tituloPeriodo = (desde: string, hasta: string) => `💰 *Meta · ${diaMes(desde)} al ${diaMes(hasta)}*`;

/** Grupo (JID @g.us) o numero (solo digitos). Sin token de Meta, apagado. */
function destino(valor = process.env.PRESUPUESTO_META_PARA || DESTINO_POR_DEFECTO): string | null {
  if (!process.env.META_ADS_TOKEN) return null;
  const v = valor.trim();
  if (/@g\.us$/.test(v)) return v;
  const digitos = v.replace(/\D/g, "");
  return digitos.length >= 8 ? digitos : null;
}

let ultimoFallo = 0;

async function yaEnviado(clave: string): Promise<boolean> {
  const filas: unknown[] = await prisma.$queryRaw`
    SELECT 1 FROM public.whatsapp_lead_avisos
     WHERE lead_id = ${clave} AND evento = 'PRESUPUESTO_META'
       AND (estado <> 'ERROR' OR intentos >= 3)`;
  return filas.length > 0;
}

/**
 * Pensada para llamarse cada minuto. Arma el mensaje el lunes desde las
 * 10:00 (semana lunes-domingo anterior) y en los dias de ESPECIALES, una vez.
 */
export async function runPresupuestoMeta() {
  const cfg = leerConfig();
  const para = destino();
  if (!cfg || !para) return { activo: false, enviado: false };

  const { ahora, lunes, domingo } = semanaAnterior();
  if (ahora.hora < HORA_ENVIO) return { activo: true, enviado: false };

  const especial = ESPECIALES.find((e) => e.dia === ahora.fecha);
  const envio = especial
    ? {
        clave: `PRESUPUESTO_META:ESPECIAL:${especial.desde}`,
        desde: especial.desde,
        hasta: especial.hasta,
        titulo: tituloPeriodo(especial.desde, especial.hasta),
      }
    : ahora.diaSemana === 1
      ? { clave: `PRESUPUESTO_META:${lunes}`, desde: lunes, hasta: domingo, titulo: tituloSemana(lunes, domingo) }
      : null;
  if (!envio) return { activo: true, enviado: false };

  // Si Meta fallo, no reintentar cada minuto: esperar media hora.
  if (Date.now() - ultimoFallo < 30 * 60 * 1000) return { activo: true, enviado: false };
  if (await yaEnviado(envio.clave)) return { activo: true, enviado: false };

  let texto: string;
  try {
    texto = await textoPresupuesto(envio.desde, envio.hasta, envio.titulo);
  } catch (error) {
    ultimoFallo = Date.now();
    throw error;
  }
  return { activo: true, enviado: await avisar(envio.clave, "PRESUPUESTO_META", null, texto, { ...cfg, grupo: para }) };
}

/**
 * Prueba. Por defecto la ultima semana lunes-domingo terminada; `desde` y
 * `hasta` (YYYY-MM-DD) eligen otro periodo. `soloVista` devuelve el texto sin
 * mandar nada; si no, va a `para` (numero o grupo) o al destino configurado.
 */
export async function probarPresupuesto(
  opciones: { para?: string; soloVista?: boolean; desde?: string; hasta?: string } = {}
) {
  const { lunes, domingo } = semanaAnterior();
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  const desde = opciones.desde && fecha.test(opciones.desde) ? opciones.desde : lunes;
  const hasta = opciones.hasta && fecha.test(opciones.hasta) ? opciones.hasta : domingo;
  const titulo = desde === lunes && hasta === domingo ? tituloSemana(desde, hasta) : tituloPeriodo(desde, hasta);
  const texto = await textoPresupuesto(desde, hasta, `🧪 *PRUEBA* · ${titulo}`);
  if (opciones.soloVista) return { texto };

  const cfg = leerConfig();
  const para = opciones.para ? destino(opciones.para) : destino();
  if (!cfg || !para) return { texto, enviado: false, motivo: "Falta la configuracion de Evolution, el destino o el token" };
  const clave = `PRUEBA:PRESUPUESTO_META:${Date.now()}`;
  return { texto, para, enviado: await avisar(clave, "PRESUPUESTO_META", null, texto, { ...cfg, grupo: para }) };
}
