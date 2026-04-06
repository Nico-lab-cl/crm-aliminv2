import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lead = await (prisma as any).lead.findUnique({
      where: { id: params.id },
      include: {
        assignedTo: {
          select: {
            name: true,
            image: true,
          },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error("Lead Detail API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    
    // Standard update for local leads (all leads are local now)
    const updatedLead = await (prisma as any).lead.update({
      where: { id: params.id },
      data: {
        status: data.status,
        notes: data.notes,
        visited: data.visited,
        interests: data.interests,
        rating: data.rating,
        lastNoteAt: data.notes ? new Date() : undefined,
      },
    });

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error("Lead Update API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
