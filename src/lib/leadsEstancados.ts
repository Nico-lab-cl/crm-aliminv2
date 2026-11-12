import prisma from "./prisma";
import { MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";
import { avisar, leerConfig } from "./avisosWhatsappLeads";
import { ahoraEnChile, fechaCorta, inicioDelDiaEnChile } from "./resumenesWhatsapp";
import { RESULTADO_IA } from "./memoriaLead";

/**
 * Leads estancados en "Contactado" (pedido de Nicolás, 04-11-2026).
 *
 * En el pipeline de los últimos 30 días había 1.038 leads en Contactado, 5 en
 * Visita y 0 en Perdido: el asesor contacta y el lead queda ahí, sin próxima
 * acción ni cierre. Una vez al día, a las 9:00 de Chile (lunes a sábado):
 *   - push a cada asesor con cuántos tiene y los nombres de los más antiguos;
 *   - un resumen en el grupo "Leads | Alimin" con el conteo por asesor.
 *
 * Estancado = en Contactado hace 3 días o más, sin próxima acción vigente y
 * sin seguimiento ni nota en esos 3 días. Solo leads de los últimos 60 días:
 * la base histórica no es accionable y llenaría el aviso.
 *
 * El push no depende de WhatsApp: se marca en Notification (tipo
 * LEADS_ESTANCADOS) y se manda una vez por asesor y por día. El grupo usa la
 * tabla de avisos con la clave del día, igual que los resúmenes. Su CHECK
 * tiene que aceptar el evento LEADS_ESTANCADOS
 * (prisma/migrations_manual/2026-11-04_leads_estancados.sql); mientras no se
 * aplique, el grupo falla con un error en el log y los push salen igual.
 */

const HORA = 9;
const DIAS_ESTANCADO = 3;
const VENTANA_DIAS = 60;
const NOMBRES_EN_PUSH = 3;

const ASESORES: Record<string, string> = {
  [MARCELA_ID]: "Marcela",
  [ORLANDO_ID]: "Orlando",
  [BARBARA_ID]: "Bárbara",
};

type Estancado = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  assignedToId: string;
  desde: Date;
};

export async function leadsEstancados(): Promise<Estancado[]> {
  return prisma.$queryRaw<Estancado[]>`
    SELECT l.id, l."firstName", l."lastName", l."assignedToId",
           COALESCE(l."etapaDesde", l."createdAt") AS desde
      FROM "Lead" l
     WHERE upper(COALESCE(l.status, '')) = 'CONTACTADO'
       AND l."assignedToId" = ANY(${Object.keys(ASESORES)})
       AND l."createdAt" > now() - make_interval(days => ${VENTANA_DIAS}::int)
       AND COALESCE(l."etapaDesde", l."createdAt") < now() - make_interval(days => ${DIAS_ESTANCADO}::int)
       AND (l."proximaAccionAt" IS NULL OR l."proximaAccionAt" < now())
       AND COALESCE(l."lastNoteAt", l."createdAt") < now() - make_interval(days => ${DIAS_ESTANCADO}::int)
       AND NOT EXISTS (
         -- Las notas del calificador IA no cuentan: no son seguimiento de un asesor.
         SELECT 1 FROM lead_seguimientos s
          WHERE s.lead_id = l.id AND COALESCE(s.resultado, '') <> ${RESULTADO_IA}
            AND s.created_at > now() - make_interval(days => ${DIAS_ESTANCADO}::int))
     ORDER BY desde ASC`;
}

const nombre = (l: Estancado) => [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || "Sin nombre";

export function textoGrupo(fecha: string, porAsesor: Map<string, Estancado[]>): string {
  const total = Array.from(porAsesor.values()).reduce((n, ls) => n + ls.length, 0);
  const lineas = Object.entries(ASESORES).map(([id, n]) => `• ${n}: ${porAsesor.get(id)?.length || 0}`);
  return [
    `🧊 *Leads estancados en Contactado* · ${fechaCorta(fecha)}`,
    "",
    `${total} leads llevan ${DIAS_ESTANCADO} días o más en Contactado sin próxima acción.`,
    ...lineas,
    "",
    "En la app: ponles próxima acción, pásalos a Visita o márcalos como Perdido con su motivo.",
  ].join("\n");
}

/** Pensada para llamarse cada minuto: solo trabaja una vez al día. */
export async function runLeadsEstancados() {
  const ahora = ahoraEnChile();
  if (ahora.hora < HORA || ahora.diaSemana === 7) return { push: 0, grupo: false };

  const inicioHoy = inicioDelDiaEnChile(ahora.fecha);
  const yaAvisados = await prisma.notification.findMany({
    where: { type: "LEADS_ESTANCADOS", createdAt: { gte: inicioHoy } },
    select: { userId: true },
  });
  const avisados = new Set(yaAvisados.map((n) => n.userId));
  const clave = `LEADS_ESTANCADOS:${ahora.fecha}`;
  const grupoListo = await prisma
    .$queryRaw<unknown[]>`SELECT 1 FROM public.whatsapp_lead_avisos WHERE lead_id = ${clave}`
    .catch(() => [] as unknown[]);
  if (Object.keys(ASESORES).every((id) => avisados.has(id)) && grupoListo.length > 0) {
    return { push: 0, grupo: false };
  }

  const estancados = await leadsEstancados();
  const porAsesor = new Map<string, Estancado[]>();
  for (const l of estancados) {
    if (!porAsesor.has(l.assignedToId)) porAsesor.set(l.assignedToId, []);
    porAsesor.get(l.assignedToId)!.push(l);
  }

  const { createNotification } = await import("./notifications");
  let push = 0;
  for (const [id] of Object.entries(ASESORES)) {
    const suyos = porAsesor.get(id) || [];
    if (avisados.has(id) || suyos.length === 0) continue;
    const ejemplos = suyos.slice(0, NOMBRES_EN_PUSH).map(nombre).join(", ");
    await createNotification({
      userId: id,
      type: "LEADS_ESTANCADOS",
      title: `🧊 Tienes ${suyos.length} lead${suyos.length === 1 ? "" : "s"} estancado${suyos.length === 1 ? "" : "s"}`,
      body: `Llevan ${DIAS_ESTANCADO}+ días en Contactado sin próxima acción. Los más antiguos: ${ejemplos}.`,
    });
    push++;
  }

  let grupo = false;
  const cfg = leerConfig();
  if (cfg && grupoListo.length === 0 && estancados.length > 0 && grupoFalloEl !== ahora.fecha) {
    try {
      grupo = await avisar(clave, "LEADS_ESTANCADOS", null, textoGrupo(ahora.fecha, porAsesor), cfg);
    } catch (error) {
      // Se intenta una vez por día: sin esto el error saldría cada minuto.
      grupoFalloEl = ahora.fecha;
      console.error("[leads-estancados] No se pudo publicar en el grupo (¿falta el SQL del CHECK?):", error);
    }
  }
  return { push, grupo };
}

let grupoFalloEl: string | null = null;
