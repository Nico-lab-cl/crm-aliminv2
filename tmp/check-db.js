const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead' OR table_name = 'lead'
    `);
    console.log('Columns found:', result.map(c => c.column_name).join(', '));
  } catch (e) {
    console.error('Error querying information_schema:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
