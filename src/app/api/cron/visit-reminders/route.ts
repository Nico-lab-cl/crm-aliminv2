import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Simple protection via query param or header could be added here
  // For example: 
  // const { searchParams } = new URL(req.url);
  // if (searchParams.get("key") !== process.env.CRON_SECRET) return new Response("Unauthorized", { status: 401 });

  try {
    const now = new Date();
    
    // Windows to capture visits
    // 1 Day Reminder: between 23 and 25 hours away
    const dayStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const dayEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // 1 Hour Reminder: between 50 and 70 minutes away
    const hourStart = new Date(now.getTime() + 50 * 60 * 1000);
    const hourEnd = new Date(now.getTime() + 70 * 60 * 1000);

    console.log(`[Cron] Checking reminders at ${now.toISOString()}`);

    // Process 1-Day Reminders
    const leads1d = await (prisma as any).lead.findMany({
      where: {
        status: "VISITA",
        visitReminderSent1d: false,
        visitDate: {
          gte: dayStart,
          lte: dayEnd,
        },
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

    // Process 1-Hour Reminders
    const leads1h = await (prisma as any).lead.findMany({
      where: {
        status: "VISITA",
        visitReminderSent1h: false,
        visitDate: {
          gte: hourStart,
          lte: hourEnd,
        },
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

    return NextResponse.json({
      success: true,
      processed: {
        oneDay: leads1d.length,
        oneHour: leads1h.length,
      },
    });
  } catch (error: any) {
    console.error("Cron Reminder Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
