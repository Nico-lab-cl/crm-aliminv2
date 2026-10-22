import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { syncExternalLeads, syncReservationLeads } from "@/lib/syncLeads";
import externalPrisma from "@/lib/externalPrisma";

export const dynamic = "force-dynamic";

/** Lo que dice de donde llego un lead. No se pisa cuando el lead ya existe. */
const CAMPOS_DE_ORIGEN = [
  "source",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "adId",
  "adName",
  "formId",
  "comoConocio",
] as const;

/** lastActivity de un lead reabierto porque el cliente volvio a escribir. */
const ACTIVIDAD_REINGRESO = "Volvió a llenar el formulario";

/** Dos envios del mismo cliente dentro de este plazo son la misma llegada. */
const VENTANA_MISMA_LLEGADA_MS = 3 * 60 * 1000;

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
  // Marca de atencion del asesor: "false" trae solo los pendientes de contactar.
  const contacted = searchParams.get("contacted");

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
    // Comparacion insensible a mayusculas a proposito.
    //
    // La columna la escriben los dos CRM que comparten esta base. El movil
    // siempre uso mayusculas, pero el CRM web escribio un tiempo capitalizado
    // ('Contactado'), y con igualdad exacta cada uno de esos leads desaparecia
    // de este filtro sin que nada lo avisara. La normalizacion de la base ya
    // dejo todo en mayusculas; esto es el seguro para que un valor mixto que
    // entre por un import o por un script viejo no vuelva a esconder leads.
    where.status = { equals: status, mode: "insensitive" };
  }

  if (contacted === "true" || contacted === "false") {
    where.contacted = contacted === "true";
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
      comoConocio: data.comoConocio || data.como_conocio || undefined,
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
      select: {
        id: true,
        assignedToId: true,
        status: true,
        contacted: true,
        createdAt: true,
        lastActivity: true,
        ...Object.fromEntries(CAMPOS_DE_ORIGEN.map((campo) => [campo, true])),
      }
    });

    // El mismo envio puede llegar dos veces: n8n reintenta, el cliente aprieta
    // dos veces, o el lead de Meta llega por los dos CRM. Si este lead se
    // reabrio hace un momento y nadie lo ha tocado, es la misma llegada y no se
    // vuelve a avisar.
    const yaReabierto =
      !!existingLead?.assignedToId &&
      !existingLead.contacted &&
      existingLead.lastActivity === ACTIVIDAD_REINGRESO &&
      Date.now() - new Date(existingLead.createdAt).getTime() < VENTANA_MISMA_LLEGADA_MS;

    // Un cliente que ya estaba en el CRM vuelve a llenar un formulario. Solo
    // cuenta si llega por un webhook (la web o Meta): un asesor que crea a mano
    // un correo que ya existe no es el cliente escribiendo de nuevo, y
    // suscribirse al Newsletter tampoco es pedir que lo llamen.
    const reabrir =
      !!existingLead && isExternalRequest && leadData.source !== "Newsletter" && !yaReabierto;

    // Si el lead ya tenia asesor es un reingreso: se le avisa a ese asesor.
    //
    // Si no tenia, se reparte como uno nuevo. Es el caso de casi todos los leads
    // de Meta: el webhook del CRM web los inserta sin asesor un instante antes
    // de que n8n los mande aca, y antes se quedaban sin asesor y sin aviso.
    const esReingreso = reabrir && !!existingLead.assignedToId;
    const sinDueno = reabrir && !existingLead.assignedToId;

    let assignedToId = null;
    const userSession = session as any;

    if (userSession?.user?.id && userSession.user.role === "ASESOR") {
      // If an advisor is creating the lead, assign it to them directly
      assignedToId = userSession.user.id;
      leadData.assignedToId = assignedToId;
    } else if (!existingLead || sinDueno) {
      const NICOLAS_ID = "initial-admin-id";
      const MARCELA_ID = "db1e6577-01b1-4615-b35e-0d50752452f3";
      const ORLANDO_ID = "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485";
      const BARBARA_ID = "77cea468-b4a5-44e6-aaa5-0a3f376affb1";

      if (leadData.source === "Newsletter") {
        // Los leads de Newsletter siempre van al admin Nicolas, nunca al round-robin
        assignedToId = NICOLAS_ID;
      } else {
        // Restore Round Robin for all leads as requested
        const { getNextAdvisorId } = await import("@/lib/assignment");

        // Determine advisor pool based on source
        const isMetaLead = leadData.source === "META" || (data.field_data && Array.isArray(data.field_data));
        const allowedIds = isMetaLead ? [MARCELA_ID, ORLANDO_ID, BARBARA_ID] : undefined;

        assignedToId = await getNextAdvisorId(allowedIds, leadData.source);
      }
      leadData.assignedToId = assignedToId;
    }

    // Tag automatica para leads de la promocion Minipie
    const isMinipie = leadData.interests?.toUpperCase().includes("MINIPIE");
    if (isMinipie) {
      leadData.tags = leadData.tags ? `${leadData.tags}, Minipie` : "Minipie";
    }

    const actualizacion: any = { ...leadData };

    if (existingLead) {
      // El origen es de donde llego el cliente la primera vez. Un reingreso
      // por la web le cambiaba un lead de anuncio de Meta a "web aliminspa.cl"
      // y se perdia que lo habia traido el anuncio. Solo se completa lo que
      // estaba vacio.
      for (const campo of CAMPOS_DE_ORIGEN) {
        const actual = existingLead[campo];
        if (actual !== null && actual !== undefined && String(actual).trim() !== "") {
          delete actualizacion[campo];
        }
      }
    }

    if (reabrir) {
      // Vuelve a "sin contactar" con la escalera de recordatorios desde cero:
      // createdAt pasa a ser esta llegada, asi que el aviso de 5 minutos cuenta
      // desde ahora. La etapa solo retrocede desde CONTACTADO, igual que al
      // desmarcar a mano: un lead en VISITA o RESERVADO no pierde lo avanzado.
      Object.assign(actualizacion, {
        createdAt: new Date(),
        contacted: false,
        contactedAt: null,
        contactedById: null,
        followupStage: 0,
      });
      if (esReingreso) {
        actualizacion.lastActivity = ACTIVIDAD_REINGRESO;
        actualizacion.lastNoteAt = new Date();
      }
      if ((existingLead.status || "").trim().toUpperCase() === "CONTACTADO") {
        actualizacion.status = "NUEVO";
      }
    } else if (!isExternalRequest) {
      actualizacion.createdAt = new Date(); // Arrival time!
    }

    const lead = await (prisma as any).lead.upsert({
      where: { email: leadData.email },
      update: actualizacion,
      create: leadData,
    });

    // El asesor que ya lo tenia se entera de que el cliente volvio. Sin esto
    // el lead subia al tope de la lista en silencio, marcado como contactado,
    // y solo se notaba si alguien lo veia en el grupo de WhatsApp.
    if (esReingreso) {
      try {
        const { createNotification } = await import("@/lib/notifications");
        const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "Un cliente";
        await createNotification({
          userId: existingLead.assignedToId,
          title: `🔁 ${nombre} volvió a escribir`,
          body: "Ya estaba en tus leads y llenó el formulario de nuevo. Quedó otra vez como sin contactar.",
          leadId: lead.id,
          type: "REINGRESO",
        });
      } catch (notifErr) {
        console.error("Failed to send re-entry notification:", notifErr);
      }
    }

    // Trigger notification if it's a new assignment
    if ((!existingLead || sinDueno) && assignedToId) {
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
