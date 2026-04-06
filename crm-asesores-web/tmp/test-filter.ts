import { PrismaClient } from '@prisma/client';

async function testFilter() {
  const url = "postgres://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable";
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
  });

  try {
    const where: any = {
      OR: [
        { source: "lomasdelmar" },
        { interests: { contains: "lomas", mode: "insensitive" } },
        { utmCampaign: { contains: "lomas", mode: "insensitive" } },
        { notes: { contains: "lomas", mode: "insensitive" } },
        { adName: { contains: "lomas", mode: "insensitive" } }
      ]
    };

    console.log("TESTING FILTER: Project = Lomas del Mar");
    const leads = await prisma.lead.findMany({
      where: where,
      take: 10,
    });

    console.log(`Leads found with new filter: ${leads.length}`);
    leads.forEach(l => {
      console.log(`- ${l.firstName} | Source: ${l.source} | Project: ${l.interests} | Campaign: ${l.utmCampaign}`);
    });

  } catch (e: any) {
    console.error("Test failed:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

testFilter();
