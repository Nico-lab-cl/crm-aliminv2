import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

async function main() {
  const data: any = {
    "field_data": [
      {
        "name": "email",
        "values": [
          "videografo72@gmail.com"
        ]
      },
      {
        "name": "phone_number",
        "values": [
          "+56993991029"
        ]
      },
      {
        "name": "full_name",
        "values": [
          "Christian Valdivia Vargas"
        ]
      }
    ],
    "lead_id": "1624664365527265",
    "form_id": "1251578897020674",
    "source": "META",
    "ad_name": "RO | MOFU | FM 35-65+ | Promo Verano | 3No es estafa"
  };

  let leadData: any = {
    contactId: data.contactId || data.lead_id,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    email: data.email?.toLowerCase(),
    businessName: data.businessName,
    city: data.city,
    source: data.source || "WEB",
    tags: data.tags,
    lastActivity: data.lastActivity,
    utmSource: data.utmSource,
    utmMedium: data.utmMedium,
    utmCampaign: data.utmCampaign,
    utmContent: data.utmContent,
    utmTerm: data.utmTerm,
    adId: data.adId || data.ad_name,
    adName: data.ad_name,
    formId: data.form_id,
    interests: data.interests,
  };

  if (data.field_data && Array.isArray(data.field_data)) {
    data.field_data.forEach((field: { name: string; values: string[] }) => {
      const value = field.values?.[0];
      if (!value) return;

      switch (field.name) {
        case "first_name": leadData.firstName = value; break;
        case "last_name": leadData.lastName = value; break;
        case "full_name": 
          const parts = value.split(" ");
          leadData.firstName = parts[0];
          leadData.lastName = parts.slice(1).join(" ");
          break;
        case "email": leadData.email = value.toLowerCase(); break;
        case "phone_number": leadData.phone = value; break;
        case "proyecto": 
        case "interes":
        case "proyecto_de_interes":
          leadData.interests = value;
          break;
      }
    });
  }

  try {
    const existingLead = await prisma.lead.findUnique({
      where: { email: leadData.email },
      select: { id: true, assignedToId: true }
    });

    const lead = await prisma.lead.upsert({
      where: { email: leadData.email },
      update: {
        ...leadData,
        createdAt: new Date(),
      },
      create: leadData,
    });
    fs.writeFileSync("scripts/error_output.json", JSON.stringify({ success: true, leadId: lead.id }));
  } catch (err: any) {
    fs.writeFileSync("scripts/error_output.json", JSON.stringify({
      success: false,
      name: err.name,
      code: err.code,
      meta: err.meta,
      message: err.message
    }, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
