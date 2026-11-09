import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { conAutor } from "@/lib/pipeline";
import { createNotification } from "@/lib/notifications";
import { quedarseConLeadSinDueno } from "@/lib/followups";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const lead = await (prisma as any).lead.findUnique({
      where: { id: params.id },
      include: {
        assignedTo: {
          select: { name: true, image: true },
        },
      },
    });
    return NextResponse.json(lead);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching lead" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { contactoDesdeFicha, ...data } = await req.json();

    // Los botones de WhatsApp, llamada y correo de la ficha y de Actividad
    // mandan contactoDesdeFicha: contactar un lead sin dueño es tomarlo, igual
    // que responderle desde la bandeja (ver quedarseConLeadSinDueno). La marca
    // no es una columna, por eso se saca de data antes de escribir.
    if (contactoDesdeFicha === true) {
      await quedarseConLeadSinDueno(params.id, (session as any).user?.id);
    }

    const actualizar = (db: any) =>
      db.lead.update({
        where: { id: params.id },
        data: {
          ...data,
          lastNoteAt: data.notes ? new Date() : undefined,
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, image: true },
          },
        },
      });

    // Si cambia la etapa, el historial la anota a nombre del asesor.
    const updatedLead = data.status
      ? await conAutor({ usuarioId: (session as any).user?.id, origen: "ASESOR" }, actualizar)
      : await actualizar(prisma);

    // TRIGGER NOTIFICATION if assignedToId changed
    if (data.assignedToId) {
      await createNotification({
        userId: data.assignedToId,
        title: "Nuevo Lead Asignado 👤",
        body: `Se te ha asignado el lead: ${updatedLead.firstName} ${updatedLead.lastName || ''}`,
        leadId: updatedLead.id,
        type: "ASSIGNMENT",
      });
    }

    return NextResponse.json(updatedLead);
  } catch (error) {
    return NextResponse.json({ error: "Error updating lead" }, { status: 500 });
  }
}
