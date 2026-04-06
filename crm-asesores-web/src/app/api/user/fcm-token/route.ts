import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session as any).user?.id;

  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    await (prisma as any).user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    return NextResponse.json({ error: "Error saving FCM token" }, { status: 500 });
  }
}
