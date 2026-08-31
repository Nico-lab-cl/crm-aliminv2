import prisma from "./prisma";
import { createNotification } from "./notifications";

/**
 * Recordatorios de leads sin contactar.
 *
 * Un lead que entra al CRM y nadie atiende dispara tres avisos: a los 5
 * minutos, a los 30 minutos y al dia. En cuanto el asesor lo marca como
 * contactado -- a mano desde la ficha, o solo al responderle al cliente -- la
 * escalera se corta y no vuelve a sonar.
 *
 * El estado vive en Lead.followupStage, que es un contador (0 a 3) y no tres
 * banderas sueltas. Esa eleccion es la que hace que este trabajo sea seguro de
 * repetir: cada corrida avanza el contador de a uno, asi que correr el cron dos
 * veces seguidas no manda el mismo aviso dos veces, y correrlo despues de dos
 * horas caido no manda tres avisos de golpe.
 */

type Etapa = {
  stage: number;
  msDesdeCreacion: number;
  titulo: (nombre: string) => string;
  cuerpo: string;
  type: string;
};

const ETAPAS: Etapa[] = [
  {
    stage: 1,
    msDesdeCreacion: 5 * 60 * 1000,
    titulo: (n) => `⏱️ ${n} lleva 5 minutos esperando`,
    cuerpo: "Todavia nadie lo contacta. Abre la ficha y marca el contacto cuando lo atiendas.",
    type: "FOLLOWUP_5M",
  },
  {
    stage: 2,
    msDesdeCreacion: 30 * 60 * 1000,
    titulo: (n) => `⚠️ ${n} sigue sin contactar (30 minutos)`,
    cuerpo: "Media hora sin respuesta. Un lead que espera media hora casi siempre ya escribio a otro lado.",
    type: "FOLLOWUP_30M",
  },
  {
    stage: 3,
    msDesdeCreacion: 24 * 60 * 60 * 1000,
    titulo: (n) => `🔴 ${n} lleva un dia sin contactar`,
    cuerpo: "Pasaron 24 horas desde que entro. Contactalo hoy o marca en la ficha por que no corresponde.",
    type: "FOLLOWUP_1D",
  },
];

/**
 * Cuanto hacia atras mira el cron.
 *
 * Sin este limite, un backfill de leads historicos, un restore de la base o un
 * cambio de correo en el sync externo reviven leads viejos y disparan una
 * avalancha de push. Ya paso en agosto con el sync de Minipie: 215 leads por
 * ~20 corridas fueron mas de 4.000 notificaciones duplicadas. El limite de 3
 * dias cubre de sobra la escalera completa, que termina al dia.
 */
const ANTIGUEDAD_MAXIMA_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Tope de leads por corrida.
 *
 * Si algo se acumula, se procesa de a poco en corridas sucesivas en vez de
 * mandar cientos de push en un solo golpe.
 */
const MAX_POR_CORRIDA = 50;

function nombreDelLead(lead: { firstName: string | null; lastName: string | null }) {
  const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return nombre || "Un lead nuevo";
}

/**
 * Etapa mas alta que le corresponde a un lead segun su antiguedad.
 * Devuelve null si todavia no le toca ninguna nueva.
 */
function etapaQueCorresponde(creadoEn: Date, etapaActual: number, ahora: number): Etapa | null {
  const edad = ahora - creadoEn.getTime();

  // Se recorre de la ultima a la primera: si el cron estuvo caido dos horas, el
  // lead recibe UN aviso, el de 30 minutos, y no los dos que se le pasaron.
  for (let i = ETAPAS.length - 1; i >= 0; i--) {
    const etapa = ETAPAS[i];
    if (etapa.stage > etapaActual && edad >= etapa.msDesdeCreacion) return etapa;
  }

  return null;
}

/**
 * Corre una pasada de recordatorios.
 *
 * Pensada para llamarse cada minuto, pero es correcta a cualquier frecuencia:
 * no depende de que la corrida anterior haya ocurrido ni de cuando fue.
 */
export async function runLeadFollowups() {
  const ahora = Date.now();
  const desde = new Date(ahora - ANTIGUEDAD_MAXIMA_MS);
  const hasta = new Date(ahora - ETAPAS[0].msDesdeCreacion);

  const pendientes = await (prisma as any).lead.findMany({
    where: {
      contacted: false,
      followupStage: { lt: 3 },
      createdAt: { gte: desde, lte: hasta },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      followupStage: true,
      assignedToId: true,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_POR_CORRIDA,
  });

  let enviados = 0;
  let saltados = 0;

  for (const lead of pendientes) {
    const etapa = etapaQueCorresponde(lead.createdAt, lead.followupStage, ahora);
    if (!etapa) {
      saltados++;
      continue;
    }

    // El contador se avanza ANTES de notificar y solo si sigue en el valor que
    // leimos. Con esto, dos corridas simultaneas del cron no pueden mandar el
    // mismo aviso dos veces: la segunda no actualiza ninguna fila y se va.
    const avance = await (prisma as any).lead.updateMany({
      where: { id: lead.id, followupStage: lead.followupStage, contacted: false },
      data: { followupStage: etapa.stage },
    });

    if (avance.count === 0) {
      saltados++;
      continue;
    }

    // Si el lead ya tiene dueño, el aviso es solo suyo. Si no lo tiene, se
    // avisa a todo el equipo, igual que hace el chat web: el primero que
    // responda se lo queda.
    const destinatarios = lead.assignedToId
      ? [{ id: lead.assignedToId }]
      : await prisma.user.findMany({ select: { id: true } });

    const nombre = nombreDelLead(lead);

    await Promise.allSettled(
      destinatarios.map((usuario: { id: string }) =>
        createNotification({
          userId: usuario.id,
          title: etapa.titulo(nombre),
          body: etapa.cuerpo,
          type: etapa.type,
          leadId: lead.id,
        })
      )
    );

    enviados++;
  }

  return { revisados: pendientes.length, enviados, saltados };
}

/**
 * Marca un lead como contactado y apaga sus recordatorios.
 *
 * Se llama desde dos lados: el interruptor de la ficha, y automaticamente cada
 * vez que el asesor le manda un mensaje al cliente. El segundo caso es el que
 * hace que esto funcione en la practica: nadie se acuerda de tocar un
 * interruptor despues de responder.
 *
 * Es deliberadamente silencioso ante errores. Que falle la marca de contacto
 * nunca debe impedir que se envie un mensaje al cliente.
 */
export async function marcarContactado(leadId: string | null | undefined, advisorId?: string | null) {
  if (!leadId) return;

  try {
    // Solo se escribe si el lead todavia no estaba contactado. Asi el
    // "contactadoAt" guarda la primera atencion real y no la ultima respuesta,
    // que es lo que sirve para medir tiempo de reaccion.
    await (prisma as any).lead.updateMany({
      where: { id: leadId, contacted: false },
      data: {
        contacted: true,
        contactedAt: new Date(),
        contactedById: advisorId || null,
        followupStage: 3,
      },
    });
  } catch (error) {
    console.error("[followups] No se pudo marcar el lead como contactado:", error);
  }
}
