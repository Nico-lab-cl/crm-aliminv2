import prisma from "./prisma";
import { ESTADOS_CLIENTE } from "./pipelineEtapas";
import { fechaCorta, inicioDelDiaEnChile, sumarDias } from "./resumenesWhatsapp";

/**
 * Embudo de los últimos 30 días por canal (pedido de Nicolás, 04-11-2026):
 * leads → visitas → reservas, y con el gasto de Meta del mismo período, el
 * costo por visita y por reserva. Va al final del análisis semanal de Meta
 * (grupo "MKT | Alimin"), que es el que lleva plata.
 *
 * Son 30 días y no la semana porque la visita y la reserva llegan días o
 * semanas después del lead: en 7 días casi todo saldría en cero.
 *
 * Visita y reserva se leen de la etapa (Lead.status), de la marca de visita y
 * del historial de etapas (lead_etapa_historial): un lead que visitó y después
 * se perdió sigue contando como visita. Todo depende de que el asesor mueva la
 * etapa en la app; si no, el embudo sale corto.
 *
 * Google Ads no está: su gasto no se lee desde aquí. WhatsApp de anuncios
 * tampoco tiene embudo: esos chats no llegan al CRM.
 */

export const DIAS_EMBUDO = 30;

export type Canal = "META_FORMULARIO" | "META_WEB" | "GOOGLE" | "ORGANICO" | "EBOOK" | "OTROS";

export const NOMBRE_CANAL: Record<Canal, string> = {
  META_FORMULARIO: "📋 Formulario de Meta",
  META_WEB: "🌐 Web desde anuncios de Meta",
  GOOGLE: "🔎 Google Ads",
  ORGANICO: "🌱 Web orgánica y directa",
  EBOOK: "📘 Ebooks",
  OTROS: "▫️ Otros (chat, manual, importados)",
};

const minus = (s: string | null | undefined) => (s || "").trim().toLowerCase();

export function canalDe(l: {
  source: string | null; formId: string | null; adId: string | null; interests: string | null;
  utmSource: string | null; utmMedium: string | null; comoConocio?: string | null;
}): Canal {
  const fuente = minus(l.source);
  const medio = minus(l.utmMedium);
  const utm = minus(l.utmSource);
  const pagado = /paid|cpc|ppc|cpm|ads?\b|pago/.test(medio);
  if (fuente === "ebook") return "EBOOK";
  if (fuente === "meta" || l.formId || l.adId) return "META_FORMULARIO";
  if (/- ?meta\b/i.test(l.interests || "") || utm === "meta" || (/^(fb|ig)$|facebook|instagram/.test(utm) && pagado)) {
    return "META_WEB";
  }
  if (/- ?google\b/i.test(l.interests || "") || (utm === "google" && pagado)) return "GOOGLE";
  if (fuente.includes("aliminspa") || ["web", "sitio web", "lomasdelmar"].includes(fuente) || fuente.startsWith("sitio web")) {
    return "ORGANICO";
  }
  return "OTROS";
}

const ETAPAS_RESERVA = ["RESERVADO", ...ESTADOS_CLIENTE];

type Fila = { leads: number; visitas: number; reservas: number };

export async function embudoPorCanal(desde: string, hasta: string): Promise<Map<Canal, Fila>> {
  const leads: any[] = await (prisma as any).lead.findMany({
    where: {
      createdAt: { gte: inicioDelDiaEnChile(desde), lt: inicioDelDiaEnChile(sumarDias(hasta, 1)) },
      NOT: { source: { in: ["Newsletter", "CSV", "csv", "Importado"] } },
    },
    select: {
      id: true, source: true, formId: true, adId: true, interests: true,
      utmSource: true, utmMedium: true, status: true, visited: true,
    },
  });

  // Lo que pasó por Visita o Reserva aunque hoy esté en otra etapa.
  const ids = leads.map((l) => l.id);
  const visitaron = new Set<string>();
  const reservaron = new Set<string>();
  if (ids.length) {
    const historial: { lead_id: string; a: string }[] = await prisma
      .$queryRaw<{ lead_id: string; a: string }[]>`
        SELECT DISTINCT lead_id, upper(a) AS a FROM lead_etapa_historial
         WHERE lead_id = ANY(${ids}) AND upper(a) = ANY(${["VISITA", ...ETAPAS_RESERVA]})`
      .catch(() => []);
    for (const h of historial) {
      if (ETAPAS_RESERVA.includes(h.a)) reservaron.add(h.lead_id);
      visitaron.add(h.lead_id);
    }
  }

  const salida = new Map<Canal, Fila>();
  for (const l of leads) {
    const canal = canalDe(l);
    const f = salida.get(canal) || { leads: 0, visitas: 0, reservas: 0 };
    const etapa = minus(l.status).toUpperCase();
    const reservo = reservaron.has(l.id) || ETAPAS_RESERVA.includes(etapa);
    const visito = reservo || visitaron.has(l.id) || l.visited || etapa === "VISITA";
    f.leads++;
    if (visito) f.visitas++;
    if (reservo) f.reservas++;
    salida.set(canal, f);
  }
  return salida;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/**
 * El bloque para el mensaje. `gastoMeta` es el gasto de Meta en los mismos 30
 * días según el tipo de conjunto (formulario, web, WhatsApp); si Meta falla,
 * el bloque sale igual sin costos.
 */
export async function textoEmbudo(
  hasta: string,
  gastoMeta: { formulario: number; web: number; whatsapp: number } | null
): Promise<string> {
  const desde = sumarDias(hasta, -(DIAS_EMBUDO - 1));
  const embudo = await embudoPorCanal(desde, hasta);
  const l: string[] = [
    `📈 *Embudo de los últimos ${DIAS_EMBUDO} días* · leads del ${fechaCorta(desde).slice(0, 5)} al ${fechaCorta(hasta).slice(0, 5)}`,
  ];

  const gastoDe: Partial<Record<Canal, number>> = gastoMeta
    ? { META_FORMULARIO: gastoMeta.formulario, META_WEB: gastoMeta.web }
    : {};
  const orden: Canal[] = ["META_FORMULARIO", "META_WEB", "GOOGLE", "ORGANICO", "EBOOK", "OTROS"];
  for (const canal of orden) {
    const f = embudo.get(canal);
    if (!f || !f.leads) continue;
    let linea = `${NOMBRE_CANAL[canal]}: ${f.leads} leads → ${f.visitas} visitas → ${f.reservas} reservas`;
    const gasto = gastoDe[canal];
    if (gasto) {
      const porVisita = f.visitas ? pesos(gasto / f.visitas) : "sin visitas";
      const porReserva = f.reservas ? pesos(gasto / f.reservas) : "sin reservas";
      linea += ` · ${pesos(gasto)} → *${porVisita} por visita* · ${porReserva} por reserva`;
    }
    l.push(linea);
  }
  if (gastoMeta?.whatsapp) {
    l.push(`💬 WhatsApp de anuncios: ${pesos(gastoMeta.whatsapp)} · sus chats no llegan al CRM, no tienen embudo`);
  }
  l.push("_Visitas y reservas salen de las etapas que mueven los asesores en la app. Google Ads va sin costo: su gasto no se lee desde aquí._");
  return l.join("\n");
}
