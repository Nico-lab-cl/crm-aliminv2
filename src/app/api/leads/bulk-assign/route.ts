import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can bulk assign
  const userSession = session as any;
  if (userSession?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
  }

  try {
    const { emails, assignedToId } = await req.json();

    if (!assignedToId) {
      return NextResponse.json({ error: "assignedToId is required" }, { status: 400 });
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "emails array is required" }, { status: 400 });
    }

    // Verify the user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    // Normalize emails to lowercase
    const normalizedEmails = emails.map((e: string) => e.toLowerCase().trim());

    // Bulk update in batches of 500
    const batchSize = 500;
    let totalUpdated = 0;

    for (let i = 0; i < normalizedEmails.length; i += batchSize) {
      const batch = normalizedEmails.slice(i, i + batchSize);
      const result = await (prisma as any).lead.updateMany({
        where: {
          email: { in: batch },
        },
        data: {
          assignedToId: assignedToId,
          updatedAt: new Date(),
        },
      });
      totalUpdated += result.count;
    }

    // TRIGGER NOTIFICATION for bulk assignment
    if (totalUpdated > 0) {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: assignedToId,
        title: "Carga Masiva de Leads 📦",
        body: `Se te han asignado ${totalUpdated} nuevos leads masivamente.`,
        type: "ASSIGNMENT",
      });
    }

    return NextResponse.json({
      success: true,
      message: `${totalUpdated} leads asignados a ${targetUser.name}`,
      totalUpdated,
      targetUser: targetUser.name,
    });
  } catch (error: any) {
    console.error("Bulk assign error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
