// Mock testing the exclusion logic
const MARCELA_EXCLUSION_START = new Date("2026-04-05T17:55:00-04:00");
const MARCELA_EXCLUSION_END = new Date("2026-04-30T00:00:00-04:00");

function isExcluded(testDate) {
    return testDate >= MARCELA_EXCLUSION_START && testDate < MARCELA_EXCLUSION_END;
}

const now = new Date("2026-04-05T13:00:00-04:00");
const inSixHours = new Date("2026-04-05T19:00:00-04:00");

console.log(`Current time (13:00): Excluded? ${isExcluded(now)}`); // Should be false
console.log(`Future time (19:00): Excluded? ${isExcluded(inSixHours)}`); // Should be true
