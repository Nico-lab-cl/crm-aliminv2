import prisma from "./prisma";
import { queryExternal } from "./externalDb";
import externalPrisma from "./externalPrisma";
import { getNextAdvisorId, MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";
import { createNotification } from "./notifications";

const NICOLAS_ID = "initial-admin-id";

export async function syncExternalLeads() {
  console.log("Starting external leads sync...");
  
  try {
    // 1. Fetch from External DB
    const res = await queryExternal(`
      SELECT id, nombre as "firstName", '' as "lastName", email, celular as phone, 
             proyecto as "externalProject", ciudad as city, created_at as "createdAt",
             utm_source as "utmSource", utm_medium as "utmMedium", 
             utm_campaign as "utmCampaign", utm_content as "utmContent", 
             utm_term as "utmTerm"
      FROM leads
      UNION ALL
      SELECT id, '' as "firstName", '' as "lastName", email, '' as phone, 
             'Newsletter' as "externalProject", '' as city, created_at as "createdAt",
             null as "utmSource", null as "utmMedium", 
             null as "utmCampaign", null as "utmContent", 
             null as "utmTerm"
      FROM newsletter_subscribers
    `);

    const externalLeads = res.rows;
    console.log(`Found ${externalLeads.length} leads in external database.`);

    // 2. Upsert into local DB
    let syncedCount = 0;
    for (const ext of externalLeads) {
      if (!ext.email) continue;

      const emailLower = ext.email.toLowerCase();

      try {
        // Check if lead exists to determine if we should auto-assign
        const existingLead = await (prisma as any).lead.findUnique({
          where: { email: emailLower },
          select: { id: true, assignedToId: true }
        });

        const isNewsletter = ext.externalProject === 'Newsletter';

        let assignedToId = existingLead?.assignedToId || null;
        if (isNewsletter) {
          // Los leads de Newsletter siempre van al admin Nicolas, nunca al round-robin
          assignedToId = NICOLAS_ID;
        } else if (!assignedToId) {
          assignedToId = await getNextAdvisorId(undefined, 'web aliminspa.cl');
        }

        const isMinipie = ext.externalProject?.toUpperCase().includes('MINIPIE');
        const tags = isMinipie ? 'Minipie' : undefined;

        const upserted = await (prisma as any).lead.upsert({
          where: { email: emailLower },
          update: {
            firstName: ext.firstName,
            phone: ext.phone,
            source: ext.externalProject === 'Newsletter' ? 'Newsletter' : 'web aliminspa.cl',
            city: ext.city,
            interests: ext.externalProject !== 'Newsletter' ? ext.externalProject : undefined,
            tags: tags,
            utmSource: ext.utmSource,
            utmMedium: ext.utmMedium,
            utmCampaign: ext.utmCampaign,
            utmContent: ext.utmContent,
            utmTerm: ext.utmTerm,
            createdAt: new Date(ext.createdAt),
            assignedToId: assignedToId,
          },
          create: {
            email: emailLower,
            firstName: ext.firstName,
            phone: ext.phone,
            source: ext.externalProject === 'Newsletter' ? 'Newsletter' : 'web aliminspa.cl',
            city: ext.city,
            interests: ext.externalProject !== 'Newsletter' ? ext.externalProject : undefined,
            tags: tags,
            utmSource: ext.utmSource,
            utmMedium: ext.utmMedium,
            utmCampaign: ext.utmCampaign,
            utmContent: ext.utmContent,
            utmTerm: ext.utmTerm,
            createdAt: new Date(ext.createdAt),
            status: 'NUEVO',
            assignedToId: assignedToId,
          }
        });

        // Notificación push para leads Minipie
        if (isMinipie && assignedToId) {
          try {
            await createNotification({
              userId: assignedToId,
              title: "🏠 Nuevo Lead Minipie",
              body: `${ext.firstName} está interesado/a en ${ext.externalProject}`,
              leadId: upserted.id,
              type: "NEW_LEAD",
            });
          } catch (notifErr) {
            console.error("Failed to send Minipie notification:", notifErr);
          }
        }

        syncedCount++;
      } catch (upsertError) {
        console.error(`Error syncing lead ${ext.email}:`, upsertError);
      }
    }

    console.log(`Sync completed. Successfully synced ${syncedCount} leads.`);
    return { success: true, count: syncedCount };
  } catch (error) {
    console.error("Critical error during external sync:", error);
    return { success: false, error };
  }
}

export async function syncReservationLeads() {
  console.log("Starting external reservations sync (Lomas del Mar)...");
  
  try {
    // 1. Fetch from External DB (db-alimin) using raw SQL for Reservation + Lot join
    const reservations: any = await (externalPrisma as any).$queryRawUnsafe(`
      SELECT 
        r.id, 
        r.name as "firstName", 
        r.email, 
        r.phone, 
        r.pipeline_stage as status, 
        r.utm_campaign as "utmCampaign",
        r.utm_source as "utmSource",
        r.utm_medium as "utmMedium",
        r.created_at as "createdAt",
        l.number as "lote",
        l.stage as "etapa"
      FROM "Reservation" r
      LEFT JOIN "Lot" l ON r.lot_id = l.id
      WHERE r.email IS NOT NULL 
        AND (r.status = 'paid' OR r.pipeline_stage ILIKE '%PAGADA%' OR r.status = 'confirmado')
    `);

    console.log(`Found ${reservations.length} reservations in external database.`);

    // 2. Upsert into local DB
    let syncedCount = 0;
    for (const res of reservations) {
      if (!res.email) continue;
      const emailLower = res.email.toLowerCase();

      try {
        // Fetch existing lead to preserve source and assignment if it exists
        const existingLead = await (prisma as any).lead.findUnique({
          where: { email: emailLower },
          select: { source: true, assignedToId: true }
        });

        let assignedToId = existingLead?.assignedToId || null;
        if (!assignedToId) {
          const leadSource = existingLead?.source || "lomasdelmar";
          assignedToId = await getNextAdvisorId(undefined, leadSource);
        }

        await (prisma as any).lead.upsert({
          where: { email: emailLower },
          update: {
            firstName: res.firstName,
            phone: res.phone,
            // Preserve original source (Meta, CSV, TikTok) if it exists
            source: existingLead?.source || "lomasdelmar",
            interests: "Lomas del Mar",
            lote: res.lote?.toString(),
            etapa: res.etapa?.toString(),
            utmCampaign: res.utmCampaign,
            utmSource: res.utmSource,
            utmMedium: res.utmMedium,
            status: res.status || 'RESERVADO',
            updatedAt: new Date(),
            assignedToId: assignedToId,
          },
          create: {
            email: emailLower,
            firstName: res.firstName,
            phone: res.phone,
            source: "lomasdelmar",
            interests: "Lomas del Mar",
            lote: res.lote?.toString(),
            etapa: res.etapa?.toString(),
            utmCampaign: res.utmCampaign,
            utmSource: res.utmSource,
            utmMedium: res.utmMedium,
            status: res.status || 'RESERVADO',
            createdAt: new Date(res.createdAt || Date.now()),
            assignedToId: assignedToId,
          }
        });
        syncedCount++;
      } catch (upsertError) {
        console.error(`Error syncing reservation lead ${res.email}:`, upsertError);
      }
    }

    console.log(`Reservation sync completed. Successfully synced ${syncedCount} leads.`);
    return { success: true, count: syncedCount };
  } catch (error: any) {
    console.error("Critical error during reservation sync:", error);
    return { success: false, error: error.message };
  }
}

export async function syncExternalBookings() {
  console.log("Starting external bookings sync...");
  try {
    // 1. Fetch bookings from External DB (bookings table)
    const res = await queryExternal(`
      SELECT id, nombre, email, celular, proyecto, fecha, hora, status, created_at as "createdAt"
      FROM bookings
      WHERE status = 'confirmed'
      ORDER BY created_at ASC
    `);

    const externalBookings = res.rows;
    console.log(`Found ${externalBookings.length} bookings in external database.`);

    let syncedCount = 0;
    
    for (const booking of externalBookings) {
      if (!booking.email) continue;
      const emailLower = booking.email.toLowerCase();

      try {
        // 2. Check if booking already synced
        const existingBookingLead = await (prisma as any).lead.findFirst({
          where: { bookingId: booking.id },
          select: { id: true }
        });

        if (existingBookingLead) {
          // Already synced!
          continue;
        }

        // 3. Parse and combine fecha + hora
        const bookingDate = new Date(booking.fecha);
        const year = bookingDate.getFullYear();
        const month = String(bookingDate.getMonth() + 1).padStart(2, '0');
        const day = String(bookingDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const timePart = booking.hora || "12:00";
        const visitDate = new Date(`${dateStr}T${timePart}:00`);

        // Check if there is an existing lead with this email
        const existingLead = await (prisma as any).lead.findUnique({
          where: { email: emailLower },
          select: { id: true, assignedToId: true }
        });

        let leadId;
        let assignedToId;
        
        if (existingLead) {
          // Keep existing advisor if already assigned (so test leads stay with Nicolas)
          assignedToId = existingLead.assignedToId;

          // If not assigned yet, use round-robin
          if (!assignedToId) {
            assignedToId = await getNextAdvisorId([MARCELA_ID, ORLANDO_ID, BARBARA_ID], "VISITA");
          }

          // Update existing lead
          const updatedLead = await (prisma as any).lead.update({
            where: { email: emailLower },
            data: {
              bookingId: booking.id,
              visited: true,
              visitDate: visitDate,
              visitProject: booking.proyecto,
              status: "VISITA",
              lastActivity: "Visita programada (Web)",
              notes: `Visita programada vía web: ${booking.proyecto} para el ${dateStr} a las ${timePart}`,
              assignedToId: assignedToId,
            }
          });
          leadId = updatedLead.id;
        } else {
          // New lead gets assigned to Marcela/Orlando in round-robin
          assignedToId = await getNextAdvisorId([MARCELA_ID, ORLANDO_ID, BARBARA_ID], "VISITA");

          // Create new lead
          const newLead = await (prisma as any).lead.create({
            data: {
              email: emailLower,
              firstName: booking.nombre,
              phone: booking.celular,
              source: "web aliminspa.cl",
              interests: booking.proyecto,
              visited: true,
              visitDate: visitDate,
              visitProject: booking.proyecto,
              status: "VISITA",
              lastActivity: "Visita programada (Web)",
              notes: `Visita programada vía web: ${booking.proyecto} para el ${dateStr} a las ${timePart}`,
              bookingId: booking.id,
              assignedToId: assignedToId,
            }
          });
          leadId = newLead.id;
        }

        // 4. Create notification
        if (assignedToId) {
          try {
            await createNotification({
              userId: assignedToId,
              title: "🗓️ Nueva Visita Agendada",
              body: `${booking.nombre} agendó para ${booking.proyecto} el ${dateStr} a las ${timePart}`,
              leadId: leadId,
              type: "VISIT",
            });
          } catch (notifErr) {
            console.error("Failed to send booking notification:", notifErr);
          }
        }

        syncedCount++;
      } catch (bookingError) {
        console.error(`Error syncing booking ${booking.id}:`, bookingError);
      }
    }

    console.log(`Booking sync completed. Successfully synced ${syncedCount} bookings.`);
    return { success: true, count: syncedCount };

  } catch (error: any) {
    console.error("Critical error during bookings sync:", error);
    return { success: false, error: error.message };
  }
}