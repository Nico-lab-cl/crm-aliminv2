import { externalPrisma } from '../src/lib/externalPrisma';

async function main() {
  try {
    console.log("LISTING ALL TABLES IN CURRENT DATABASE...");
    const tables: any = await (externalPrisma as any).$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log("TABLES FOUND:", JSON.stringify(tables, null, 2));

    if (tables.some((t: any) => t.table_name.toLowerCase() === 'reservation')) {
        const actualName = tables.find((t: any) => t.table_name.toLowerCase() === 'reservation').table_name;
        console.log(`\nPROBING TABLE: "${actualName}"`);
        const count: any = await (externalPrisma as any).$queryRawUnsafe(`SELECT count(*) FROM "${actualName}"`);
        console.log("COUNT:", count);
    }

  } catch (e: any) {
    console.log("FAILED:", e.message);
  } finally {
    await (externalPrisma as any).$disconnect();
  }
}

main();
