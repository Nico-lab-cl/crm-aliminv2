import prisma from "./prisma";
import { createNotification } from "./notifications";
import { DUENO_MIENTRAS_ALI } from "./ali";
import { avisarAlGrupo } from "./aliRedes";
import { ETAPAS_CERRADAS, canonico } from "./pipelineEtapas";

/**
 * Aviso cuando el calificador IA marca como "calificado" a un lead que ya
 * tiene asesor (Nicolás, 12-11-2026: push + grupo de leads).
 *
 * Nació del caso de Valentín: dijo en el chat web que necesitaba cerrar hoy,
 * la IA lo calificó, y como el lead ya era de una asesora nadie se enteró. Los
 * leads de Ali (todavía de Nicolás) no entran acá: esos pasan solos a la
 * rueda al llegar a 28 puntos (aliRedes.ts).
 *
 * Corre cada 10 minutos. Un aviso por lead cada 7 días (se revisa en
 * Notification) para no llenar el grupo.
 */

const HORAS_HACIA_ATRAS = 3;
const DIAS_ENTRE_AVISOS = 7;
const TIPO = "IA_CALIFICADO";
const CANAL: Record<string, string> = { web: "chat web", instagram: "Instagram", facebook: "Facebook" };

type Calificado = { lead_id: string; canal: string | null; proyecto: string | null; resumen: string | null };

async function calificadosDelCrmWeb(): Promise<Calificado[]> {
  if (!process.env.IA_SECRET) return [];
  const base = (process.env.CRM_WEB_URL || "https://marketing.aliminspa.cl").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/webhooks/ia/calificados?horas=${HORAS_HACIA_ATRAS}`, {
    headers: { "x-ia-secret": process.env.IA_SECRET },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`el CRM web respondió ${res.status}`);
  const d = (await res.json()) as { calificados?: Calificado[] };
  return d.calificados || [];
}

export async function avisarCalificadosIA() {
  const calificados = await calificadosDelCrmWeb();
  let n = 0;
  for (const c of calificados) {
    const lead = await prisma.lead.findUnique({
      where: { id: c.lead_id },
      select: { id: true, firstName: true, lastName: true, status: true, assignedToId: true, assignedTo: { select: { name: true } } },
    });
    if (!lead?.assignedToId || lead.assignedToId === DUENO_MIENTRAS_ALI) continue;
    if (ETAPAS_CERRADAS.includes(canonico(lead.status))) continue;

    const desde = new Date(Date.now() - DIAS_ENTRE_AVISOS * 24 * 60 * 60 * 1000);
    const yaAvisado = await prisma.notification.findFirst({
      where: { leadId: lead.id, type: TIPO, createdAt: { gte: desde } },
      select: { id: true },
    });
    if (yaAvisado) continue;

    const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Cliente";
    const canal = CANAL[c.canal || ""] || c.canal || "el chat";
    const resumen = (c.resumen || "").replace(/\s+/g, " ").trim();

    await createNotification({
      userId: lead.assignedToId,
      title: "🔥 La IA calificó a tu lead",
      body: `${nombre} (${canal})${resumen ? ` · ${resumen}` : ""}`.slice(0, 180),
      leadId: lead.id,
      type: TIPO,
    });
    // En el grupo están todos los asesores: nunca teléfono ni correo.
    await avisarAlGrupo(
      [
        `🔥 *La IA calificó un lead · ${canal}*`,
        "",
        `*Cliente:* ${nombre}`,
        c.proyecto ? `*Proyecto:* ${c.proyecto}` : null,
        resumen ? `*Lo que dijo:* ${resumen.slice(0, 400)}` : null,
        `*Asesor a cargo:* ${lead.assignedTo?.name || "su asesor"}`,
        "",
        "👉 Escríbele hoy: está listo para avanzar.",
      ]
        .filter((l) => l !== null)
        .join("\n")
    );
    n++;
  }
  return n;
}
