import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    console.log("TESTING WITH queryRaw (lowercase)...");
    const res: any = await (externalPrisma as any).$queryRawUnsafe('SELECT count(*) FROM "reservation"');
    console.log("RESULT (reservation):", res);
  } catch (e: any) {
    console.log("lowercase reservation FAILED:", e.message);
  }

  try {
    console.log("\nTESTING WITH queryRaw (Capitalized)...");
    const res2: any = await (externalPrisma as any).$queryRawUnsafe('SELECT count(*) FROM "Reservation"');
    console.log("RESULT (Reservation):", res2);
  } catch (e: any) {
    console.log("Capitalized Reservation FAILED:", e.message);
  }
}

main();
