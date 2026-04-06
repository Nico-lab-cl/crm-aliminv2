import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    console.log("TESTING externalPrisma (as imported in API)...");
    const count = await (externalPrisma as any).reservation.count();
    console.log("COUNT:", count);
    
    const sample = await (externalPrisma as any).reservation.findFirst({
        select: { email: true, status: true, pipeline_stage: true }
    });
    console.log("SAMPLE:", JSON.stringify(sample, null, 2));

  } catch (e: any) {
    console.error("ERROR:", e.message);
  } finally {
    await (externalPrisma as any).$disconnect();
  }
}

main();
