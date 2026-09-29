import prisma from "./prisma";
import { queryExternal } from "./externalDb";
import externalPrisma from "./externalPrisma";
import { getNextAdvisorId, MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";
import { createNotification } from "./notifications";

const NICOLAS_ID = "initial-admin-id";

/**
 * Un lead web encontrado despues de este plazo ya no se anuncia como nuevo:
 * entra al CRM con su fecha real y sin escalera de recordatorios.
 */
const PLAZO_LEAD_NUEVO_MS = 48 * 60 * 60 * 1000;

type OpcionesSync = {
  /**
   * Limita la lectura de la base externa a los ultimos N dias. El temporizador
   * de instrumentation.ts lo usa para no reescribir la tabla completa cada dos
   * minutos; el sync on-demand del listado sigue leyendo todo.
   */
  ultimosDias?: number;
};

/**
 * Un solo sync de cada tipo a la vez dentro del proceso.
 *
 * El temporizador y el sync on-demand del listado pueden coincidir. Si corren
 * en paralelo, los dos ven el mismo lead como nuevo y los dos mandan el aviso.
 * Quien llega mientras hay uno en curso espera ese mismo resultado.
 */
const syncsEnCurso = new Map<string, Promise<any>>();

function unaVezALaVez<T>(nombre: string, trabajo: () => Promise<T>): Promise<T> {
  const enCurso = syncsEnCurso.get(nombre);
  if (enCurso) return enCurso;
  const promesa = trabajo().finally(() => syncsEnCurso.delete(nombre));
  syncsEnCurso.set(nombre, promesa);
  return promesa;
}

function esRegistroDuplicado(error: any) {
  return error?.code === "P2002";
}

/**
 * Arma el instante de una visita a partir de la fecha y la hora que el cliente
 * eligio, que son hora de Chile. new Date("YYYY-MM-DDTHH:MM") las interpretaria
 * con la zona del servidor, y el contenedor corre en UTC: la visita quedaba
 * corrida 3 o 4 horas y el recordatorio de "visita en 1 hora" salia a destiempo.
 */
function instanteEnChile(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  let [hh, mm] = hora.split(":").map(Number);
  if (!Number.isFinite(hh)) hh = 12;
  if (!Number.isFinite(mm)) mm = 0;

  const comoSiFueraUtc = Date.UTC(y, m - 1, d, hh, mm);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(comoSiFueraUtc));
  const parte = (tipo: string) => Number(partes.find(p => p.type === tipo)?.value);
  const vistoEnChile = Date.UTC(parte("year"), parte("month") - 1, parte("day"), parte("hour") % 24, parte("minute"));

  // Desfase de Santiago respecto de UTC en esa fecha (-3h o -4h segun horario de verano).
  const desfase = vistoEnChile - comoSiFueraUtc;
  return new Date(comoSiFueraUtc - desfase);
}

export function syncExternalLeads(opciones: OpcionesSync = {}) {
  // La clave separa el sync acotado del completo: el on-demand del listado no
  // debe quedarse con el resultado de una pasada que solo miro 3 dias.
  return unaVezALaVez(`leads-${opciones.ultimosDias ?? "todo"}`, () => syncExternalLeadsInterno(opciones));
}

async function syncExternalLeadsInterno({ ultimosDias }: OpcionesSync) {
  console.log("Starting external leads sync...");

  try {
    const filtroFecha = ultimosDias
      ? `WHERE created_at > now() - interval '${Math.floor(ultimosDias)} days'`
      : "";

    // 1. Fetch from External DB
    const res = await queryExternal(`
      SELECT id, nombre as "firstName", '' as "lastName", email, celular as phone,
             proyecto as "externalProject", ciudad as city, created_at as "createdAt",
             utm_source as "utmSource", utm_medium as "utmMedium",
             utm_campaign as "utmCampaign", utm_content as "utmContent",
             utm_term as "utmTerm"
      FROM leads
      ${filtroFecha}
      UNION ALL
      SELECT id, '' as "firstName", '' as "lastName", email, '' as phone,
             'Newsletter' as "externalProject", '' as city, created_at as "createdAt",
             null as "utmSource", null as "utmMedium",
             null as "utmCampaign", null as "utmContent",
             null as "utmTerm"
      FROM newsletter_subscribers
      ${filtroFecha}
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

        const datos = {
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
          assignedToId: assignedToId,
        };

        if (existingLead) {
          // Un lead que ya esta en el CRM no se pisa. Casi siempre llego antes
          // por el webhook de aliminspa.cl, que manda el nombre partido en
          // firstName/lastName; reescribirle firstName con el nombre completo
          // dejaba la ficha como "Juan Perez Perez". Tampoco se le cambia el
          // asesor: un lead de un asesor que se suscribe al newsletter no debe
          // pasar a Nicolas. Solo se completa el asesor si no tenia.
          if (!existingLead.assignedToId && assignedToId) {
            await (prisma as any).lead.update({
              where: { id: existingLead.id },
              data: { assignedToId },
            });
          }
          syncedCount++;
          continue;
        }

        // isRecent: el cliente escribio hace menos de 48 horas. Solo esos se
        // anuncian como nuevos; un lead viejo que aparece tarde (backfill,
        // cambio de email, restore de la base) entra en silencio.
        const isRecent =
          Date.now() - new Date(ext.createdAt).getTime() < PLAZO_LEAD_NUEVO_MS;

        let created;
        try {
          created = await (prisma as any).lead.create({
            data: {
              ...datos,
              email: emailLower,
              status: 'NUEVO',
              // Un lead reciente cuenta desde que llega al CRM, no desde que el
              // cliente lleno el formulario. Si no, el sync atrasado lo mostraba
              // con fecha pasada y los recordatorios de "5 minutos" y "1 dia"
              // saltaban en el mismo minuto en que el asesor lo recibia.
              createdAt: isRecent ? new Date() : new Date(ext.createdAt),
              // Los viejos y los de Newsletter no entran a la escalera de
              // recordatorios: nadie recibio un aviso de "nuevo" por ellos.
              followupStage: isRecent && !isNewsletter ? 0 : 3,
            },
          });
        } catch (createErr) {
          // Otra instancia del CRM lo creo en paralelo: esa ya mando el aviso.
          if (esRegistroDuplicado(createErr)) continue;
          throw createErr;
        }

        if (!isNewsletter && isRecent && assignedToId) {
          try {
            await createNotification({
              userId: assignedToId,
              title: "🌐 Nuevo Lead Web",
              body: ext.externalProject
                ? `${ext.firstName} está interesado/a en ${ext.externalProject}`
                : `${ext.firstName} envió una consulta desde aliminspa.cl`,
              leadId: created.id,
              type: "NEW_LEAD",
            });
          } catch (notifErr) {
            console.error("Failed to send web lead notification:", notifErr);
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

export function syncExternalBookings(opciones: OpcionesSync = {}) {
  return unaVezALaVez(`visitas-${opciones.ultimosDias ?? "todo"}`, () => syncExternalBookingsInterno(opciones));
}

async function syncExternalBookingsInterno({ ultimosDias }: OpcionesSync) {
  console.log("Starting external bookings sync...");
  try {
    const filtroFecha = ultimosDias
      ? `AND created_at > now() - interval '${Math.floor(ultimosDias)} days'`
      : "";

    // 1. Fetch bookings from External DB (bookings table)
    const res = await queryExternal(`
      SELECT id, nombre, email, celular, proyecto, fecha, hora, status, created_at as "createdAt"
      FROM bookings
      WHERE status = 'confirmed'
      ${filtroFecha}
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
        const visitDate = instanteEnChile(dateStr, timePart);

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
        // Solo por visitas que todavia no ocurren: una agenda vieja que aparece
        // tarde se registra igual, pero avisarla ya no le sirve a nadie.
        if (assignedToId && visitDate.getTime() > Date.now()) {
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