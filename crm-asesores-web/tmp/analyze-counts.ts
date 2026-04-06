import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    console.log("ANALYZING Reservation COUNT BY STATUS...");
    const res: any = await (externalPrisma as any).$queryRawUnsafe(`
      SELECT status, pipeline_stage, count(*) 
      FROM "Reservation" 
      GROUP BY status, pipeline_stage
    `);
    console.log("COUNTS:", JSON.stringify(res, null, 2));

    const total: any = await (externalPrisma as any).$queryRawUnsafe('SELECT count(*) FROM "Reservation"');
    console.log("TOTAL:", total);

  } catch (e: any) {
    console.log("FAILED:", e.message);
  } finally {
    await (externalPrisma as any).$disconnect();
  }
}

main();
