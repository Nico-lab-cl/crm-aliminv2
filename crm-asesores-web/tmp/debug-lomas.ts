import { PrismaClient } from '@prisma/client';

async function main() {
  const url = "postgres://alimin:alimin2026@72.62.11.186:5432/db-alimin?sslmode=disable";
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
  });

  try {
    console.log("TESTING CONNECTION TO db-alimin...");
    // Check tables
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    console.log("TABLES FOUND:", JSON.stringify(tables, null, 2));

    console.log("\nQUERING 'reservation' (singular)...");
    const countSingular = await prisma.$queryRaw`SELECT count(*) FROM "reservation"`;
    console.log("COUNT SINGULAR:", countSingular);

    console.log("\nQUERING 'Reservation' (Capitalized)...");
    const countCap = await prisma.$queryRaw`SELECT count(*) FROM "Reservation"`;
    console.log("COUNT CAPITALIZED:", countCap);

    console.log("\nSAMPLE RESERVATIONS (status paid):");
    const samples = await prisma.$queryRaw`SELECT email, status, pipeline_stage FROM "reservation" WHERE status = 'paid' OR pipeline_stage ILIKE '%PAGADA%' LIMIT 5`;
    console.log("SAMPLES:", JSON.stringify(samples, null, 2));

  } catch (e: any) {
    console.error("DEBUG ERROR:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
