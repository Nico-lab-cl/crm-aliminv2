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
      select: { id: true, createdAt: true, status: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "El lead no existe" }, { status: 404 });
    }

    // La etapa acompaña a la marca, pero solo en los dos bordes.
    //
    // Un lead atendido no puede seguir figurando como "Nuevo": es lo primero
    // que mira cualquiera de los dos CRM para decidir a quien llamar, y una fila
    // que dice "Nuevo" y "Atendido" a la vez no le sirve a nadie.
    //
    // Al desmarcar pasa lo inverso, pero solo desde CONTACTADO: un lead en
    // VISITA o RESERVADO ya avanzo mas alla de esto y retrocederlo por un toque
    // en el interruptor seria borrar informacion que costo conseguir.
    const etapa = (lead.status || "").trim().toUpperCase();
    let nuevaEtapa: string | undefined;
    if (contactado && etapa === "NUEVO") {
      nuevaEtapa = "CONTACTADO";
    } else if (!contactado && etapa === "CONTACTADO") {
      nuevaEtapa = "NUEVO";
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
            ...(nuevaEtapa ? { status: nuevaEtapa } : {}),
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
            ...(nuevaEtapa ? { status: nuevaEtapa } : {}),
          },
      select: {
        id: true,
        status: true,
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
