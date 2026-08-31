import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * El asesor marca (o desmarca) que ya atendio a un cliente.
 *
 * Existe como ruta propia y no como un campo mas del PATCH general de la ficha
 * porque marcar el contacto no es escribir una columna: son cuatro campos que
 * tienen que moverse juntos o el dato queda mintiendo. En particular
 * followupStage, que es lo que apaga los recordatorios; si alguien marcara
 * "contacted" por el PATCH general, el lead figuraria atendido y el cron le
 * seguiria mandando avisos al asesor.
 *
 * El interruptor va en los dos sentidos a proposito. Se marca solo al
 * responderle al cliente, asi que un toque por error o una respuesta enviada a
 * la conversacion equivocada dejaria al lead fuera de los recordatorios para
 * siempre, sin manera de recuperarlo salvo entrando a la base a mano.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const advisorId = (session.user as any).id as string;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Sin cuerpo se asume que la intencion es marcar como contactado, que es
    // el caso de lejos mas frecuente.
  }

  const contactado = body?.contacted !== false;

  try {
    const lead = await (prisma as any).lead.findUnique({
      where: { id: params.id },
      select: { id: true, createdAt: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "El lead no existe" }, { status: 404 });
    }

    const actualizado = await (prisma as any).lead.update({
      where: { id: params.id },
      data: contactado
        ? {
            contacted: true,
            contactedAt: new Date(),
            contactedById: advisorId,
            // Se cierra la escalera completa: el lead sale del cron.
            followupStage: 3,
            lastActivity: "Marcado como contactado",
            lastNoteAt: new Date(),
          }
        : {
            contacted: false,
            contactedAt: null,
            contactedById: null,
            // Al reabrirlo, la escalera se reanuda desde donde le corresponda
            // por antiguedad, no desde cero: un lead de ayer que se reabre
            // recibe el aviso de un dia, no el de cinco minutos.
            followupStage: 0,
            lastActivity: "Marcado como pendiente de contactar",
            lastNoteAt: new Date(),
          },
      select: {
        id: true,
        contacted: true,
        contactedAt: true,
        contactedById: true,
        contactedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(actualizado);
  } catch (error) {
    console.error("[leads/contacted] Error marcando el contacto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
