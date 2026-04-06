import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgres://alimin:alimin2026@72.62.11.186:5432/db-alimin?sslmode=disable",
      },
    },
  });

  try {
    const users = await prisma.$queryRawUnsafe('SELECT id, name, email FROM "User"');
    console.log("All Users Search:");
    (users as any[]).forEach(u => {
      const name = u.name.toLowerCase();
      if (name.includes('orlando') || name.includes('marce') || name.includes('barbara')) {
        console.log(`FOUND: ID=${u.id} | Name=${u.name} | Email=${u.email}`);
      }
    });

  } catch (e: any) {
    console.error("Connection Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
