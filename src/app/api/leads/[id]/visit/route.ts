import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { conAutor } from "@/lib/pipeline";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { visitProject, lote, etapa, visitDate } = await req.json();

    // El historial de etapas anota la visita a nombre del asesor.
    const autor = { usuarioId: session.user?.id, origen: "ASESOR", motivo: "Visita programada" };
    const updatedLead = await conAutor(autor, (tx) => tx.lead.update({
      where: { id: params.id },
      data: {
        visited: true,
        visitProject: visitProject || undefined,
        lote: lote || undefined,
        etapa: etapa || undefined,
        visitDate: visitDate ? new Date(visitDate) : undefined,
        interests: visitProject || undefined,
        notes: `Visita programada: ${visitProject} - Lote ${lote}, Etapa ${etapa}`,
        lastActivity: "Visita programada",
        status: "VISITA",
        visitReminderSent1d: false, // Reset reminders for the new date
        visitReminderSent1h: false,
      } as any,
    }));

    return NextResponse.json(updatedLead);
  } catch (error) {
    return NextResponse.json({ error: "Error registering visit" }, { status: 500 });
  }
}
