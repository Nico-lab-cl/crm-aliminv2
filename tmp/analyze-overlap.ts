import prisma from '../src/lib/prisma';

async function main() {
  console.log("ANALYZING 57 LOMAS DEL MAR LEADS...");
  
  const ldmLeads = await (prisma as any).lead.findMany({
    where: { source: 'lomasdelmar' },
    select: { email: true, firstName: true }
  });

  console.log(`Analyzing ${ldmLeads.length} leads...`);

  // Check overlap with other sources
  const otherLeads = await (prisma as any).lead.findMany({
    where: { 
        source: { not: 'lomasdelmar' },
        email: { in: ldmLeads.map((l: any) => l.email) }
    },
    select: { email: true, source: true, utmSource: true, adName: true }
  });

  console.log(`FOUND ${otherLeads.length} OVERLAPPING LEADS IN OTHER SOURCES:`);
  otherLeads.forEach((l: any) => {
    console.log(`- ${l.email}: Source=[${l.source}], UTM=[${l.utmSource}], Ad=[${l.adName}]`);
  });

  // Check how many are from 'csv import'
  const csvLeads = otherLeads.filter((l: any) => l.source?.toLowerCase().includes('csv'));
  console.log(`\n- From CSV Import: ${csvLeads.length}`);
  
  // Check how many are from Meta/TikTok
  const metaLeads = otherLeads.filter((l: any) => ['facebook', 'instagram', 'meta', 'tiktok'].includes(l.source?.toLowerCase() || ''));
  console.log(`- From Meta/TikTok: ${metaLeads.length}`);
}

main().catch(err => console.error(err));
