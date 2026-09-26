import prisma from "./prisma";

const ADVISORS = [
  { id: "db1e6577-01b1-4615-b35e-0d50752452f3", name: "Marcela" },
  { id: "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485", name: "Orlando" },
  { id: "77cea468-b4a5-44e6-aaa5-0a3f376affb1", name: "Barbara" },
];

export const MARCELA_ID = "db1e6577-01b1-4615-b35e-0d50752452f3";
export const ORLANDO_ID = "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485";
export const BARBARA_ID = "77cea468-b4a5-44e6-aaa5-0a3f376affb1";

/**
 * Reparto del round robin automatico (web y agendamientos).
 * Orlando vuelve a la rueda tras su ausencia: 35 Marcela / 35 Orlando / 30 Barbara.
 * Para sacar a alguien basta con dejarle peso 0 aqui y volver a desplegar;
 * un asesor con peso 0 nunca entra en la rueda aunque lo pidan los allowedIds.
 */
const ADVISOR_WEIGHTS: Record<string, number> = {
  [MARCELA_ID]: 35,
  [ORLANDO_ID]: 35,
  [BARBARA_ID]: 30,
};

/**
 * Manual exclusion for Marcela
 * Action: Set to TRUE to stop assigning leads to Marcela. Set to FALSE to resume.
 */
const MARCELA_EXCLUDED = false;

/**
 * GLOBAL SWITCH: Set to true to resume automatic assignments.
 * Leads will be assigned using the Round Robin system.
 */
const AUTO_ASSIGNMENT_ENABLED = true;

/**
 * Get current hour in Chile (America/Santiago) to ensure time-based assignment works 
 * regardless of host server location.
 */
function getChileHour(): number {
  const chileTimeString = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(chileTimeString, 10);
}

/**
 * Checks if the current time is within the allowed assignment window.
 * Always returns true now to allow 24/7 lead assignments.
 */
export function isWithinAssignmentWindow(): boolean {
  return true;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Arma el ciclo de turnos que respeta los pesos: con 35/35/30 devuelve 20 turnos,
 * 7 de Marcela, 7 de Orlando y 6 de Barbara. Los reparte lo mas parejo posible (M,O,B,M,O,B,...)
 * en vez de dar 7 seguidos a cada uno, para que ningun asesor quede sin leads
 * durante media jornada.
 */
function buildRotation(advisors: { id: string; name: string }[]): string[] {
  const weights = advisors.map(a => ADVISOR_WEIGHTS[a.id] ?? 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Sin pesos configurados caemos a un round robin parejo.
  if (totalWeight <= 0) return advisors.map(a => a.id);

  const slots = totalWeight / weights.reduce((acc, w) => gcd(acc, w), 0);
  const given = advisors.map(() => 0);
  const rotation: string[] = [];

  for (let slot = 0; slot < slots; slot++) {
    let best = 0;
    let bestDeficit = -Infinity;
    for (let i = 0; i < advisors.length; i++) {
      // Cuantos turnos le deberian tocar a estas alturas del ciclo menos los que ya lleva.
      const deficit = (weights[i] / totalWeight) * (slot + 1) - given[i];
      if (deficit > bestDeficit + 1e-9) {
        bestDeficit = deficit;
        best = i;
      }
    }
    given[best]++;
    rotation.push(advisors[best].id);
  }

  return rotation;
}

export async function getNextAdvisorId(allowedIds?: string[], source?: string | null) {
  if (!AUTO_ASSIGNMENT_ENABLED) {
    console.log("[Auto-Assignment] Global assignment is currently DISABLED. Returning null.");
    return null;
  }

  // Time-window check: 9 AM to Midnight Chile
  if (!isWithinAssignmentWindow()) {
    console.log(`[Auto-Assignment] Outside allowed window (Current Chile Hour: ${getChileHour()}). Returning null.`);
    return null;
  }

  try {
    // 1. Determine available advisors
    let targetAdvisors = allowedIds
      ? ADVISORS.filter(a => allowedIds.includes(a.id))
      : [...ADVISORS];

    // 2. Drop advisors with no share (peso 0 en ADVISOR_WEIGHTS)
    targetAdvisors = targetAdvisors.filter(a => (ADVISOR_WEIGHTS[a.id] ?? 0) > 0);

    // 3. Apply Marcela's manual exclusion
    if (MARCELA_EXCLUDED) {
      console.log(`[Auto-Assignment] Marcela is manually EXCLUDED from automatic lead assignments.`);
      targetAdvisors = targetAdvisors.filter(a => a.id !== MARCELA_ID);
    }

    if (targetAdvisors.length === 0) {
      console.warn("[Auto-Assignment] No advisors available after filtering. Falling back to default.");
      return MARCELA_EXCLUDED ? BARBARA_ID : MARCELA_ID;
    }

    const rotation = buildRotation(targetAdvisors);

    // 4. Posicion en el ciclo: cada asignacion suma exactamente un lead al grupo,
    // asi que el total ya repartido nos dice que turno toca ahora.
    const assignedCount = await (prisma as any).lead.count({
      where: { assignedToId: { in: targetAdvisors.map(a => a.id) } }
    });

    const selectedId = rotation[assignedCount % rotation.length];

    return selectedId;
  } catch (error) {
    console.error("Error calculating next advisor:", error);
    // Safe fallback: Barbara si Marcela esta excluida
    return MARCELA_EXCLUDED ? BARBARA_ID : MARCELA_ID;
  }
}
