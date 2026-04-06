import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true }
  });
  console.log('--- USUARIOS ---');
  users.forEach(u => console.log(`${u.name} (Rol: ${u.role}) -> ID: ${u.id}`));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
