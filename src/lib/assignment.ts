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
const MARCELA_EXCLUDED = true;

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
 * Checks if the current time is within the allowed assignment window (9:00 AM - 12:00 AM Chile).
 */
export function isWithinAssignmentWindow(): boolean {
  const currentHour = getChileHour();
  // Window: 9 AM (inclusive) until midnight (exclusive 24)
  // 9, 10, ..., 23 are valid. 0-8 are invalid.
  return currentHour >= 9 && currentHour < 24;
}

export async function getNextAdvisorId(allowedIds?: string[]) {
  // Redirect all leads to admin as requested
  const ADMIN_ID = "initial-admin-id";
  console.log(`[Auto-Assignment] Redirecting lead to admin: ${ADMIN_ID}`);
  return ADMIN_ID;
}

