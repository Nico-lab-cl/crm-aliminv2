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

/**
 * La rueda guarda su propio estado en una fila de IntegrationToken (igual que
 * el token de Instagram), con dos cosas por asesor:
 *
 * - `actual`: el puntaje del reparto ponderado "suave" (el de nginx). En cada
 *   turno cada candidato suma su peso, se elige al de mayor puntaje y a ese se
 *   le resta la suma de los pesos. Con 35/35/30 sale M,O,B,M,O,B... y nunca
 *   el mismo dos veces seguidas, y si alguien vuelve de vacaciones no le cae
 *   una avalancha (el puntaje nunca se aleja mas de un turno).
 * - `entregados`: cuantos leads le ha dado la rueda a cada uno, para revisar.
 *
 * Antes el turno se sacaba contando TODOS los leads de los asesores, y cada
 * lead creado a mano por un asesor, tomado del chat web o reasignado le movia
 * el turno a la rueda: podian caerle dos o tres seguidos a la misma persona
 * (caso de Marcela, 17-11-2026). Ahora solo la rueda mueve la rueda.
 */
const RUEDA = "rueda_asesores";

type EstadoRueda = { actual: Record<string, number>; entregados: Record<string, number> };

function leerEstado(texto: string | null | undefined): EstadoRueda {
  try {
    const e = JSON.parse(texto || "{}");
    return { actual: e.actual || {}, entregados: e.entregados || {} };
  } catch {
    return { actual: {}, entregados: {} };
  }
}

/** Elige al siguiente y deja el estado actualizado. Funcion pura, para poder probarla. */
export function siguienteTurno(candidatos: string[], estado: EstadoRueda): string {
  const total = candidatos.reduce((s, id) => s + (ADVISOR_WEIGHTS[id] ?? 0), 0);
  let elegido = candidatos[0];
  let mejor = -Infinity;
  for (const id of candidatos) {
    estado.actual[id] = (estado.actual[id] ?? 0) + (ADVISOR_WEIGHTS[id] ?? 0);
    if (estado.actual[id] > mejor) {
      mejor = estado.actual[id];
      elegido = id;
    }
  }
  estado.actual[elegido] -= total;
  estado.entregados[elegido] = (estado.entregados[elegido] ?? 0) + 1;
  return elegido;
}

/**
 * Toma el turno con la fila bloqueada (SELECT ... FOR UPDATE): si entran dos
 * leads al mismo tiempo, el segundo espera al primero y nunca les toca el
 * mismo turno.
 */
async function tomarTurno(candidatos: string[]): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "IntegrationToken" (id, platform, "accessToken", "updatedAt")
      VALUES (${`rueda-${Date.now()}`}, ${RUEDA}, '{}', NOW())
      ON CONFLICT (platform) DO NOTHING`;
    const filas = await tx.$queryRaw<{ accessToken: string }[]>`
      SELECT "accessToken" FROM "IntegrationToken" WHERE platform = ${RUEDA} FOR UPDATE`;
    const estado = leerEstado(filas[0]?.accessToken);
    const elegido = siguienteTurno(candidatos, estado);
    await tx.$executeRaw`
      UPDATE "IntegrationToken" SET "accessToken" = ${JSON.stringify(estado)}, "updatedAt" = NOW()
      WHERE platform = ${RUEDA}`;
    return elegido;
  });
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

    const selectedId = await tomarTurno(targetAdvisors.map(a => a.id));
    const nombre = ADVISORS.find(a => a.id === selectedId)?.name;
    console.log(`[Auto-Assignment] Rueda -> ${nombre} (${source || "sin origen"})`);
    return selectedId;
  } catch (error) {
    console.error("Error calculating next advisor:", error);
    // Si la base falla, al azar segun los pesos: nunca todos a la misma persona.
    const ids = ADVISORS.map(a => a.id).filter(id => (ADVISOR_WEIGHTS[id] ?? 0) > 0 && (!allowedIds || allowedIds.includes(id)));
    if (ids.length === 0) return MARCELA_EXCLUDED ? BARBARA_ID : MARCELA_ID;
    let r = Math.random() * ids.reduce((s, id) => s + ADVISOR_WEIGHTS[id], 0);
    for (const id of ids) {
      r -= ADVISOR_WEIGHTS[id];
      if (r <= 0) return id;
    }
    return ids[ids.length - 1];
  }
}
