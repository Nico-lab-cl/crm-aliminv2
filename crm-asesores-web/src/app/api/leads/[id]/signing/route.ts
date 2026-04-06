import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { signingStatus, signingProject, signingLote, signingEtapa, signingDate } = await req.json();

    // 1. Fetch the lead to get its current notes
    const currentLead = await (prisma as any).lead.findUnique({
      where: { id: params.id },
      select: { notes: true }
    });

    const newNote = `\nRegistro de Firma [${new Date().toLocaleString('es-CL')}]: ${signingStatus} - ${signingProject} (Lote ${signingLote}, ${signingEtapa})`;
    const updatedNotes = (currentLead?.notes || "") + newNote;
    
    // 2. Perform the update
    const updatedLead = await (prisma as any).lead.update({
      where: { id: params.id },
      data: {
        signingStatus: signingStatus || undefined,
        signingProject: signingProject || undefined,
        signingLote: signingLote || undefined,
        signingEtapa: signingEtapa || undefined,
        signingDate: signingDate ? new Date(signingDate) : null,
        notes: updatedNotes,
        lastActivity: `Estado de firma: ${signingStatus}`,
      } as any,
    });

    return NextResponse.json(updatedLead);
  } catch (error: any) {
    console.error("Error registering signing:", error);
    return NextResponse.json({ error: "Error registering signing", details: error.message }, { status: 500 });
  }
}
