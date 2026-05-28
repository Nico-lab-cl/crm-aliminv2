import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { syncExternalLeads, syncReservationLeads } from "@/lib/syncLeads";
import externalPrisma from "@/lib/externalPrisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const skip = (page - 1) * limit;
  
  const source = searchParams.get("source");
  const status = searchParams.get("status");
  const visited = searchParams.get("visited");
  const rating = searchParams.get("rating");
  const search = searchParams.get("q");
  const unassigned = searchParams.get("unassigned") === "true";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const ownerId = searchParams.get("ownerId");

  // --- TRIGGER SYNC ---
  if (source === "web aliminspa.cl") {
    try {
      console.log("Triggering on-demand sync for external leads...");
      await syncExternalLeads();
    } catch (syncErr) {
      console.error("Sync failed, continuing with existing local data", syncErr);
    }
  }

  if (source === "lomasdelmar") {
    try {
      console.log("Triggering on-demand sync for reservation leads...");
      await syncReservationLeads();
    } catch (syncErr) {
      console.error("Reservation sync failed, continuing with existing local data", syncErr);
    }
  }

  // Build where clause
  let where: any = {};
  
  if (source && source !== "TODOS") {
    if (source === "lomasdelmar") {
      where.interests = { contains: "Lomas del Mar" };
    } else {
      where.source = source;
    }
  }

  if (status && status !== "TODOS") {
    where.status = status;
  }

  if (rating && rating !== "TODOS") {
    where.rating = rating;
  }

  if (visited === "true") {
    where.visited = true;
  }

  if (search) {
    const tokens = search.trim().split(/\s+/);
    if (tokens.length > 0) {
      where.AND = tokens.map(token => ({
        OR: [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
          { phone: { contains: token } },
          { email: { contains: token, mode: 'insensitive' } },
        ]
      }));
    }
  }

  if (startDate || endDate) {
    where.OR = [
      {
        createdAt: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        }
      },
      {
        updatedAt: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        }
      }
    ];
  }

  // Role-based filtering and specialized 'unassigned' view
  const userSession = session as any;
  if (userSession?.user) {
    if (userSession.user.role === "ADMIN") {
      if (unassigned) {
        where.assignedToId = null;
      } else if (ownerId && ownerId !== "TODOS") {
        where.assignedToId = ownerId;
      }
    } else {
      // Non-admins only see theirs
      where.assignedToId = userSession.user.id;
    }
  }

  try {
    const [leads, total] = await Promise.all([
      (prisma as any).lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          assignedTo: {
            select: {
              name: true,
              image: true,
            },
          },
        },
      }),
      (prisma as any).lead.count({ where }),
    ]);

    return NextResponse.json({
      leads,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error: any) {
    console.error("Leads API Error:", error);
    return NextResponse.json({ 
      error: "Error al obtener los leads", 
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-crm-api-key");
  const isExternalRequest = apiKey === "lomas_del_mar_secret_2026";
  
  let session = null;
  if (!isExternalRequest) {
    session = await getServerSession(authOptions as any);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const data = await req.json();
    
    let leadData: any = {
      contactId: data.contactId || data.lead_id,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      email: (data.email || data.correo_electrinico)?.toLowerCase(), // Try both
      businessName: data.businessName,
      city: data.city,
      source: data.source || "WEB",
      tags: data.tags,
      lastActivity: data.lastActivity,
      utmSource: data.utmSource || data.utm_source, // Capture both formats
      utmMedium: data.utmMedium || data.utm_medium,
      utmCampaign: data.utmCampaign || data.utm_campaign,
      utmContent: data.utmContent || data.utm_content,
      utmTerm: data.utmTerm || data.utm_term,
      adId: data.adId || data.ad_id,
      adName: data.adName || data.ad_name,
      formId: data.formId || data.form_id,
      interests: data.interests,
    };

    // If it comes from Meta field_data array
    let isSpanishForm = false;
    let isDisqualified = false;
    let qualificationNote = "";
    let additionalTag = "";

    if (data.field_data && Array.isArray(data.field_data)) {
      data.field_data.forEach((field: { name: string; values: string[] }) => {
        const value = field.values?.[0];
        if (!value) return;

        switch (field.name) {
          case "first_name": leadData.firstName = value; break;
          case "last_name": leadData.lastName = value; break;
          case "full_name":
          case "nombre_completo":
            if (field.name === "nombre_completo") isSpanishForm = true;
            const parts = value.split(" ");
            leadData.firstName = parts[0];
            leadData.lastName = parts.slice(1).join(" ");
            break;
          case "email":
          case "correo_electrónico":
            if (field.name === "correo_electrónico") isSpanishForm = true;
            leadData.email = value.toLowerCase(); 
            break;
          case "phone_number":
          case "número_de_teléfono":
            if (field.name === "número_de_teléfono") isSpanishForm = true;
            leadData.phone = value; 
            break;
          case "proyecto": 
          case "interes":
          case "proyecto_de_interes":
            leadData.interests = value;
            break;
          case "capital_inicial":
          case "¿con_qué_capital_inicial_(pie)_cuentas_para_tu_terreno?":
          case "¿cuCuál_es_tu_capital_para_el_pie?_(mínimo_$15.000.000)":
            const val = value.toLowerCase();
            // Lomas del Mar (5M+)
            if (value === "bajo_5m" || val.includes("menos de $5.000.000")) {
              isDisqualified = true;
            } else if (value === "entre_5m_10m" || val.includes("entre $5.000.000")) {
              qualificationNote = "Capital Inicial: Entre 5M y 10M";
              additionalTag = "Capital_5M_10M";
            } else if (value === "sobre_10m_contado" || val.includes("más de $10.000.000")) {
              qualificationNote = "Capital Inicial: Sobre 10M o Contado";
              additionalTag = "Capital_10M_Mas";
            }
            // Arena y Sol (15M+)
            else if (value === "bajo_15m" || val.includes("aún no cuento con ese monto")) {
              isDisqualified = true;
            } else if (value === "entre_15m_25m" || val.includes("entre $15.000.000")) {
              qualificationNote = "Capital Inicial: Entre 15M y 25M";
              additionalTag = "Capital_15M_25M";
            } else if (value === "sobre_25m_contado" || val.includes("más de $25.000.000")) {
              qualificationNote = "Capital Inicial: Sobre 25M o Contado";
              additionalTag = "Capital_25M_Mas";
            }
            break;
        }
      });
    }

    // CRITICAL SAFETY CHECK: If email is still undefined, we cannot use it in findUnique/upsert
    if (!leadData.email) {
      console.warn("Lead received without email. Using lead_id as fallback unique identifier if available.", data.lead_id);
      return NextResponse.json({ error: "Email is required for lead creation" }, { status: 400 });
    }

    // Qualification Exclusion
    if (isDisqualified) {
      console.log(`[Qualification] Lead ${leadData.email} excluded due to low capital.`);
      return NextResponse.json({ 
        message: "Lead processed but excluded due to qualification criteria", 
        excluded: true 
      });
    }

    // Apply Tags and Notes if qualified
    if (additionalTag) {
      leadData.tags = leadData.tags ? `${leadData.tags}, ${additionalTag}` : additionalTag;
    }
    if (qualificationNote) {
      leadData.notes = leadData.notes ? `${qualificationNote}\n${leadData.notes}` : qualificationNote;
    }

    // Check if lead exists to determine if we should auto-assign
    const existingLead = await (prisma as any).lead.findUnique({
      where: { email: leadData.email },
      select: { id: true, assignedToId: true }
    });

    let assignedToId = null;
    const userSession = session as any;

    if (userSession?.user?.id && userSession.user.role === "ASESOR") {
      // If an advisor is creating the lead, assign it to them directly
      assignedToId = userSession.user.id;
      leadData.assignedToId = assignedToId;
    } else if (!existingLead) {
      // Specialized Assignment Rules for Meta Platform
      const MARCELA_ID = "db1e6577-01b1-4615-b35e-0d50752452f3";
      const ORLANDO_ID = "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485";

      // Restore Round Robin for all leads as requested
      const { getNextAdvisorId } = await import("@/lib/assignment");
      
      // Determine advisor pool based on source
      // If it's a META lead (webhook from field_data or explicit source), exclude Barbara
      const isMetaLead = leadData.source === "META" || (data.field_data && Array.isArray(data.field_data));
      const allowedIds = isMetaLead ? [MARCELA_ID, ORLANDO_ID] : undefined;
      
      assignedToId = await getNextAdvisorId(allowedIds);
      leadData.assignedToId = assignedToId;
    }

    const lead = await (prisma as any).lead.upsert({
      where: { email: leadData.email },
      update: {
        ...leadData,
        createdAt: new Date(), // Arrival time!
      },
      create: leadData,
    });
    
    // Trigger notification if it's a new assignment
    if (!existingLead && assignedToId) {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: assignedToId,
        title: "Nuevo Lead Asignado (Auto) 🤖",
        body: `Se te ha asignado un nuevo lead de ${leadData.source}: ${leadData.firstName} ${leadData.lastName || ''}`,
        leadId: lead.id,
        type: "ASSIGNMENT",
      });
    }

    return NextResponse.json(lead);
  } catch (error: any) {
    console.error("Error creating lead:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error?.message || String(error),
      meta: error?.meta
    }, { status: 500 });
  }
}
