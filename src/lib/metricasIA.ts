import prisma from "./prisma";

/**
 * Métricas de Ali por canal (pedidas por Nicolás, 11-11-2026):
 *   - conversaciones que atendió Ali,
 *   - % de esas conversaciones con teléfono en la ficha,
 *   - leads que creó Ali (Instagram - IA / Facebook - IA; en la web, los del chat),
 *   - conversaciones con visita agendada (nota "📅 Ali agendó…" o lead con visita).
 * Lo mismo calcula el CRM web en /agentes-ia; si cambia uno, cambiar el otro.
 */

export interface MetricaCanal {
  canal: "web" | "instagram" | "facebook";
  conversaciones: number;
  conTelefono: number;
  leads: number;
  visitas: number;
}

const FUENTE_LEADS: Record<MetricaCanal["canal"], string> = {
  web: "Chat web aliminspa.cl",
  instagram: "Instagram - IA",
  facebook: "Facebook - IA",
};

export async function metricasIA(desde: Date, hasta: Date): Promise<MetricaCanal[]> {
  const conv = await prisma.$queryRaw<{ platform: string; conversaciones: number; con_telefono: number; visitas: number }[]>`
    WITH atendidas AS (
      SELECT DISTINCT c.id, c.platform, c."leadId"
        FROM "Conversation" c
        JOIN "Message" m ON m."conversationId" = c.id
       WHERE c.platform IN ('web', 'instagram', 'facebook')
         AND m."senderType" = 'ali' AND m."sourceType" IN ('DIRECT', 'HANDOFF')
         AND (m."createdAt" AT TIME ZONE 'UTC') >= ${desde} AND (m."createdAt" AT TIME ZONE 'UTC') < ${hasta}
    )
    SELECT a.platform,
           COUNT(*)::int AS conversaciones,
           COUNT(*) FILTER (WHERE COALESCE(l.phone, '') <> '')::int AS con_telefono,
           COUNT(*) FILTER (
             WHERE l."bookingId" IS NOT NULL
                OR EXISTS (SELECT 1 FROM "Message" e WHERE e."conversationId" = a.id
                             AND e."sourceType" = 'EVENTO' AND e.text LIKE '📅 Ali agendó%')
           )::int AS visitas
      FROM atendidas a
      LEFT JOIN "Lead" l ON l.id = a."leadId"
     GROUP BY a.platform`;

  const leads = await prisma.$queryRaw<{ source: string; n: number }[]>`
    SELECT source, COUNT(*)::int AS n FROM "Lead"
     WHERE source IN (${FUENTE_LEADS.web}, ${FUENTE_LEADS.instagram}, ${FUENTE_LEADS.facebook})
       AND ("createdAt" AT TIME ZONE 'UTC') >= ${desde} AND ("createdAt" AT TIME ZONE 'UTC') < ${hasta}
     GROUP BY source`;

  return (["web", "instagram", "facebook"] as const).map((canal) => {
    const c = conv.find((x) => x.platform === canal);
    return {
      canal,
      conversaciones: c?.conversaciones ?? 0,
      conTelefono: c?.con_telefono ?? 0,
      leads: leads.find((x) => x.source === FUENTE_LEADS[canal])?.n ?? 0,
      visitas: c?.visitas ?? 0,
    };
  });
}

const NOMBRE: Record<MetricaCanal["canal"], string> = { web: "Web", instagram: "Instagram", facebook: "Facebook" };

/** Líneas para el resumen del grupo. Vacío si Ali no atendió a nadie en el período. */
export function textoMetricasIA(m: MetricaCanal[]): string[] {
  const activos = m.filter((x) => x.conversaciones > 0 || x.leads > 0);
  if (!activos.length) return [];
  const l = ["🤖 *Ali (IA)*"];
  for (const x of activos) {
    const pct = x.conversaciones ? Math.round((x.conTelefono / x.conversaciones) * 100) : 0;
    l.push(`   ${NOMBRE[x.canal]}: ${x.conversaciones} conversaciones · ${pct}% con teléfono · ${x.leads} leads · ${x.visitas} con visita`);
  }
  return l;
}
