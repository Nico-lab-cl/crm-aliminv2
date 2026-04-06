import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conversation = await (prisma as any).conversation.findUnique({
      where: { id: params.id },
      include: {
        lead: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
                select: { name: true, image: true }
            }
          }
        }
      }
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation details:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
