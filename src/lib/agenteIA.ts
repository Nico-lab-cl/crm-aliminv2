import prisma from "./prisma";
import { ETAPAS_CERRADAS, canonico } from "./pipelineEtapas";
import { estadoDeVisita, visitaRealizada } from "./visitaRealizada";

/**
 * Qué IA atiende a la persona según la etapa de su lead (fase 3, 12-11-2026):
 *
 *   - Sin visita, con visita agendada o si no llegó  → Ali ("atraccion").
 *   - Llegó a la visita (o se asume) y no ha reservado → Cierre ("cierre").
 *   - Reservado, cliente o perdido                   → Ali, que con la memoria
 *     deriva la postventa al asesor.
 *
 * El sitio solo usa Cierre si el agente está encendido en el CRM web; si no,
 * sigue Ali. Si un asesor escribió hace menos de 2 h, no responde ninguna IA
 * (eso lo decide aliRedes.ts antes de llegar acá).
 */
export type AgenteIA = "atraccion" | "cierre";

export async function agenteParaLead(leadId: string | null | undefined): Promise<AgenteIA> {
  if (!leadId) return "atraccion";
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    if (!lead || ETAPAS_CERRADAS.includes(canonico(lead.status))) return "atraccion";
    return visitaRealizada(await estadoDeVisita(leadId)) ? "cierre" : "atraccion";
  } catch (error) {
    console.error(`[agente-ia] No se pudo decidir el agente de ${leadId}; sigue Ali:`, error);
    return "atraccion";
  }
}
