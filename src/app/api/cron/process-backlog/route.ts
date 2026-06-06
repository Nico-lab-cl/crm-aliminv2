import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getNextAdvisorId, isWithinAssignmentWindow } from "@/lib/assignment";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Cron Job: Processes unassigned leads (the backlog) one by one.
 * Trigger this endpoint periodically (e.g., every 10-20 minutes) during the day.
 */
export async function GET(req: Request) {
  try {
    // 1. Check if we are in the active window (9:00 AM - 12:00 AM Chile)
    if (!isWithinAssignmentWindow()) {
      return NextResponse.json({ 
        message: "Outside assignment window (9 AM - 12 AM Chile). Skipping distribution." 
      });
    }

    // 2. Find the oldest unassigned lead
    const lead = await (prisma as any).lead.findFirst({
      where: {
        assignedToId: null,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!lead) {
      return NextResponse.json({ message: "No unassigned leads in backlog." });
    }

    // 3. Determine the allowed advisors based on lead source (to match Meta assignment rules)
    const MARCELA_ID = "db1e6577-01b1-4615-b35e-0d50752452f3";
    const ORLANDO_ID = "a6ce92ca-f1a1-4dcf-a042-fda1c31ca485";
    
    // If it's a Meta lead, only Marcela or Orlando
    const isMetaLead = lead.source === "META" || lead.utmSource === "facebook" || lead.utmSource === "instagram";
    const allowedIds = isMetaLead ? [MARCELA_ID, ORLANDO_ID] : undefined;

    // 4. Get the next advisor in the Round Robin sequence
    const assignedToId = await getNextAdvisorId(allowedIds, lead.source);

    if (!assignedToId) {
       return NextResponse.json({ 
         message: "Could not determine advisor or assignment logic returned null." 
       });
    }

    // 5. Assign the lead and save
    await (prisma as any).lead.update({
      where: { id: lead.id },
      data: { assignedToId },
    });

    // 6. Trigger a push notification to the advisor
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
      // We don't fail the whole request if notification fails
    }

    return NextResponse.json({ 
      success: true, 
      lead: { id: lead.id, email: lead.email, source: lead.source }, 
      assignedTo: assignedToId 
    });
  } catch (error: any) {
    console.error("Error in process-backlog cron:", error);
    return NextResponse.json({ 
      error: "Internal Server Error", 
      details: error.message 
    }, { status: 500 });
  }
}
