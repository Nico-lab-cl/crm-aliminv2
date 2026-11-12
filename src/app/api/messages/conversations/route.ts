import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { filtroBandeja } from "@/lib/ali";

export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Solo chat web atendido por Ali y, para un asesor, solo lo suyo o lo que
    // no tiene dueño (ver filtroBandeja en lib/ali.ts).
    const conversations = await prisma.conversation.findMany({
      where: filtroBandeja(session.user),
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            assignedToId: true,
            status: true,
            rating: true,
            assignedTo: {
              select: { name: true, image: true }
            }
          }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
