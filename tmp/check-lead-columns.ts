import prisma from '../src/lib/prisma';

async function checkColumns() {
  try {
    const columns: any = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    console.log("COLUMNS in 'Lead':", columns);

    const lowercaseColumns: any = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'lead'
    `);
    console.log("COLUMNS in 'lead':", lowercaseColumns);

  } catch (error: any) {
    console.error("Error checking columns:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkColumns();
