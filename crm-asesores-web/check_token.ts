import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({
    where: { id: "db1e6577-01b1-4615-b35e-0d50752452f3" },
    select: { name: true, fcmToken: true }
  });
  console.log("USER_DATA:", user);
  await prisma.$disconnect();
}
main();
