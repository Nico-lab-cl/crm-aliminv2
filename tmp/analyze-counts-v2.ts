import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    const res: any = await (externalPrisma as any).$queryRawUnsafe(`
      SELECT status, pipeline_stage, count(*) as count
      FROM "Reservation" 
      GROUP BY status, pipeline_stage
    `);
    
    // Map BigInt to String for display
    const mapped = res.map((r: any) => ({
        ...r,
        count: r.count.toString()
    }));
    
    console.log("COUNTS BY STATUS/STAGE:");
    console.log(JSON.stringify(mapped, null, 2));

  } catch (e: any) {
    console.log("FAILED:", e.message);
  } finally {
    await (externalPrisma as any).$disconnect();
  }
}

main();
