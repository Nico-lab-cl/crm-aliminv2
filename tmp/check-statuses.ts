import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    console.log("FETCHING UNIQUE STATUS AND PIELINE_STAGE FROM 'reservation'...");
    const statuses: any = await (externalPrisma as any).$queryRawUnsafe('SELECT DISTINCT status, pipeline_stage FROM "reservation"');
    console.log("STATUSES:", JSON.stringify(statuses, null, 2));

    const totalLeadsWithEmails: any = await (externalPrisma as any).$queryRawUnsafe('SELECT count(DISTINCT email) FROM "reservation"');
    console.log("TOTAL EMAILS:", totalLeadsWithEmails);

  } catch (e: any) {
    console.log("FAILED:", e.message);
  } finally {
    await (externalPrisma as any).$disconnect();
  }
}

main();
