import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();
const META_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

async function syncProfiles() {
  console.log("Starting Meta Profile Sync...");

  const conversations = await prisma.conversation.findMany({
    where: {
      metaName: null,
      psid: { not: "" }
    }
  });

  console.log(`Found ${conversations.length} conversations missing names.`);

  for (const conv of conversations) {
    try {
      console.log(`Fetching profile for PSID: ${conv.psid} (${conv.platform})`);
      
      const fields = "first_name,last_name,profile_pic,name,username";
      const url = `https://graph.facebook.com/v21.0/${conv.psid}?fields=${fields}&access_token=${META_TOKEN}`;
      
      const res = await axios.get(url);
      const data = res.data;

      const name = data.name || data.username || (data.first_name ? `${data.first_name} ${data.last_name}` : null);
      const image = data.profile_pic || data.profile_picture?.data?.url || null;

      if (name) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { metaName: name, metaImage: image }
        });
        console.log(`✅ Updated: ${name}`);
      } else {
        console.log(`⚠️ No name found for ${conv.psid}`);
      }
    } catch (error: any) {
      console.log(`❌ Error for ${conv.psid}: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  console.log("Sync complete!");
}

syncProfiles()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
