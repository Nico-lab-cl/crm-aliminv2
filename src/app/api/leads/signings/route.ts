import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // format: YYYY-MM

  if (!month) {
    return NextResponse.json({ error: "month parameter is required (YYYY-MM)" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  const endDate = new Date(year, mon, 1); // first day of next month

  const userSession = session as any;

  try {
    let where: any = {
      signingDate: {
        gte: startDate,
        lt: endDate,
      },
    };

    // Non-admin users only see their own assigned leads' signings
    if (userSession?.user?.role !== "ADMIN") {
      where.assignedToId = userSession.user.id;
    }

    const signings = await (prisma as any).lead.findMany({
      where,
      orderBy: { signingDate: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        signingDate: true,
        signingProject: true,
        signingLote: true,
        signingEtapa: true,
        signingStatus: true,
        status: true,
        rating: true,
        assignedTo: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ signings });
  } catch (error: any) {
    console.error("Signings API Error:", error);
    return NextResponse.json({ error: "Error fetching signings", details: error.message }, { status: 500 });
  }
}
