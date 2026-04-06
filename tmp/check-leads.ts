import { PrismaClient } from '@prisma/client';

async function main() {
  // Try localhost instead of n8n_db-crm
  const url = "postgresql://nicolas:nicolas@localhost:5432/crm?sslmode=disable";
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
  });

  try {
    console.log("FETCHING LATEST 20 LEADS FROM LOCALHOST...");
    const leads = await (prisma as any).lead.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' }
    });

    console.log(`FOUND ${leads.length} LEADS`);
    leads.forEach((l: any) => {
      console.log(`--- [${l.firstName}] ---`);
      console.log(`Source: ${l.source}`);
      console.log(`Campaign: ${l.utmCampaign}`);
      console.log(`Ad Name: ${l.adName}`);
      console.log(`Interests: ${l.interests}`);
    });

  } catch (e: any) {
    console.error("Local Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
