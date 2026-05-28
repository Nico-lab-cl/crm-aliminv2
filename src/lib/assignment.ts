import prisma from "./prisma";

const ADVISORS = [
  { id: "db1e6577-01b1-4615-b35e-0d50752452f3", name: "Marcela" },
  { id: "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485", name: "Orlando" },
  { id: "77cea468-b4a5-44e6-aaa5-0a3f376affb1", name: "Barbara" },
];

/**
 * Temporary redirection for Orlando -> Marcela
 * Duration: Active until 2026-04-03T22:00:00-03:00 (10 PM Chile)
 */
const REDIRECTION_END = new Date("2026-04-03T01:00:00-03:00");

/**
 * Manual exclusion for Marcela
 * Action: Set to TRUE to stop assigning leads to Marcela. Set to FALSE to resume.
 */
const MARCELA_EXCLUDED = false;

const MARCELA_ID = "db1e6577-01b1-4615-b35e-0d50752452f3";
const ORLANDO_ID = "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485";

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

export async function getNextAdvisorId(allowedIds?: string[]) {
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

    // 2. Apply Marcela's manual exclusion
    if (MARCELA_EXCLUDED) {
      console.log(`[Auto-Assignment] Marcela is manually EXCLUDED from automatic lead assignments.`);
      targetAdvisors = targetAdvisors.filter(a => a.id !== MARCELA_ID);
    }

    if (targetAdvisors.length === 0) {
      console.warn("[Auto-Assignment] No advisors available after filtering. Falling back to default.");
      return ADVISORS[0].id === MARCELA_ID && MARCELA_EXCLUDED
        ? ADVISORS[1].id // Fallback to Orlando if Marcela is first and excluded
        : ADVISORS[0].id;
    }

    // 3. Find the last lead assigned to one of our target advisors
    const lastLead = await (prisma as any).lead.findFirst({
      where: {
        assignedToId: { in: targetAdvisors.map(a => a.id) }
      },
      orderBy: { createdAt: 'desc' },
      select: { assignedToId: true }
    });

    let nextIdx = 0;

    if (lastLead && lastLead.assignedToId) {
      // Find the index within our target group
      const lastIdx = targetAdvisors.findIndex(a => a.id === lastLead.assignedToId);
      // If the last advisor is no longer in the target list (e.g. was just excluded),
      // round-robin continues from the next available advisor.
      if (lastIdx !== -1) {
        nextIdx = (lastIdx + 1) % targetAdvisors.length;
      }
    }
    
    const selectedId = targetAdvisors[nextIdx].id;

    return selectedId;
  } catch (error) {
    console.error("Error calculating next advisor:", error);
    // Safe fallback: Orlando or Barbara if Marcela is excluded
    return MARCELA_EXCLUDED ? ORLANDO_ID : MARCELA_ID;
  }
}

