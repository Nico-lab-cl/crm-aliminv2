import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session as any).user?.id;

  try {
    const res = await (prisma as any).notification.updateMany({
      where: { 
        userId, 
        type: "VISIT", 
        read: false 
      },
      data: { read: true },
    });

    console.log(`Marked ${res.count} visit notifications as read for user ${userId}`);
    return NextResponse.json({ success: true, count: res.count });
  } catch (error: any) {
    console.error("Error marking visit notifications as read:", error);
    return NextResponse.json({ error: "Error marking visit notifications as read", details: error.message }, { status: 500 });
  }
}
