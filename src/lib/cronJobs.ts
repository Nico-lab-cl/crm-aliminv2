import prisma from "./prisma";
import { getNextAdvisorId, isWithinAssignmentWindow, MARCELA_ID, ORLANDO_ID } from "./assignment";
import { createNotification } from "./notifications";

export async function runProcessBacklog() {
  const { syncExternalBookings, syncExternalLeads, syncReservationLeads } = await import("./syncLeads");

  try {
    await syncExternalBookings();
  } catch (syncErr) {
    console.error("Booking sync failed in process-backlog cron", syncErr);
  }

  try {
    await syncExternalLeads();
  } catch (syncErr) {
    console.error("External leads sync failed in process-backlog cron", syncErr);
  }

  try {
    await syncReservationLeads();
  } catch (syncErr) {
    console.error("Reservation leads sync failed in process-backlog cron", syncErr);
  }

  if (!isWithinAssignmentWindow()) {
    return { message: "Outside assignment window (9 AM - 12 AM Chile). Skipping distribution." };
  }

  const lead = await (prisma as any).lead.findFirst({
    where: { assignedToId: null },
    orderBy: { createdAt: "asc" },
  });

  if (!lead) {
    return { message: "No unassigned leads in backlog." };
  }

  const isMetaLead = lead.source === "META" || lead.utmSource === "facebook" || lead.utmSource === "instagram";
  const allowedIds = isMetaLead ? [MARCELA_ID, ORLANDO_ID] : undefined;

  const assignedToId = await getNextAdvisorId(allowedIds, lead.source);

  if (!assignedToId) {
    return { message: "Could not determine advisor or assignment logic returned null." };
  }

  await (prisma as any).lead.update({
    where: { id: lead.id },
    data: { assignedToId },
  });

  try {
    await createNotification({
      userId: assignedToId,
      title: "Nuevo Lead Asignado (Backlog) 📥",
      body: `Se te ha asignado un lead de ${lead.source}: ${lead.firstName} ${lead.lastName || ''}`,
      leadId: lead.id,
      type: "ASSIGNMENT",
    });
  } catch (notifErr) {
    console.error("Failed to send backlog assignment notification:", notifErr);
  }

  return {
    success: true,
    lead: { id: lead.id, email: lead.email, source: lead.source },
    assignedTo: assignedToId,
  };
}

export async function runVisitReminders() {
  const now = new Date();

  const dayStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const dayEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const hourStart = new Date(now.getTime() + 50 * 60 * 1000);
  const hourEnd = new Date(now.getTime() + 70 * 60 * 1000);

  console.log(`[Cron] Checking reminders at ${now.toISOString()}`);

  const leads1d = await (prisma as any).lead.findMany({
    where: {
      status: "VISITA",
      visitReminderSent1d: false,
      visitDate: { gte: dayStart, lte: dayEnd },
    },
  });

  for (const lead of leads1d) {
    if (lead.assignedToId) {
      await createNotification({
        userId: lead.assignedToId,
        title: "🗓️ Visita Mañana",
        body: `Recuerda: Mañana tienes una visita con ${lead.firstName} ${lead.lastName || ''} en ${lead.visitProject}.`,
        leadId: lead.id,
        type: "REMINDER",
      });
      await (prisma as any).lead.update({
        where: { id: lead.id },
        data: { visitReminderSent1d: true },
      });
    }
  }

  const leads1h = await (prisma as any).lead.findMany({
    where: {
      status: "VISITA",
      visitReminderSent1h: false,
      visitDate: { gte: hourStart, lte: hourEnd },
    },
  });

  for (const lead of leads1h) {
    if (lead.assignedToId) {
      await createNotification({
        userId: lead.assignedToId,
        title: "⚠️ Visita en 1 Hora",
        body: `Tienes una visita programada en menos de una hora con ${lead.firstName} en ${lead.visitProject}.`,
        leadId: lead.id,
        type: "REMINDER",
      });
      await (prisma as any).lead.update({
        where: { id: lead.id },
        data: { visitReminderSent1h: true },
      });
    }
  }

  return {
    success: true,
    processed: { oneDay: leads1d.length, oneHour: leads1h.length },
  };
}
