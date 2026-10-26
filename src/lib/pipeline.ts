import prisma from "./prisma";
import { BARBARA_ID, MARCELA_ID, ORLANDO_ID } from "./assignment";
import {
  ETAPAS,
  ESTADOS_CLIENTE,
  ETAPAS_CERRADAS,
  ETAPAS_YA_CONTACTADO,
  MOTIVOS_PERDIDA,
  TIPOS_SEGUIMIENTO,
  canonico,
} from "./pipelineEtapas";

/**
 * Pipeline comercial.
 *
 * El historial de etapas (public.lead_etapa_historial) lo escribe un trigger
 * de Postgres sobre "Lead".status, así que cualquier cambio queda anotado:
 * el asesor, el CRM web, la visita agendada en aliminspa.cl o el portal de
 * pagos. Lo único que la aplicación agrega es quién lo hizo y por qué, con
 * set_config(..., true) dentro de la misma transacción. Ver
 * prisma/migrations_manual/2026-10-26_pipeline.sql.
 */

type Autor = { usuarioId?: string | null; origen: string; motivo?: string | null };

/** Corre `fn` en una transacción donde el trigger sabe quién mueve el lead. */
export function conAutor<T>(autor: Autor, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT set_config('alimin.usuario', ${autor.usuarioId ?? ""}, true),
                              set_config('alimin.origen', ${autor.origen}, true),
                              set_config('alimin.motivo', ${(autor.motivo ?? "").slice(0, 500)}, true)`;
    return fn(tx);
  });
}

export class ErrorPipeline extends Error {
  constructor(mensaje: string, public status = 400) {
    super(mensaje);
  }
}

/** Un asesor solo gestiona sus leads; el administrador, todos. */
export async function leadDelUsuario(leadId: string, usuario: { id: string; role?: string }) {
  const lead = await (prisma as any).lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true, contacted: true, assignedToId: true },
  });
  if (!lead) throw new ErrorPipeline("El lead no existe", 404);
  if (usuario.role !== "ADMIN" && lead.assignedToId !== usuario.id) {
    throw new ErrorPipeline("Este lead no está asignado a ti", 403);
  }
  return lead;
}

/** Campos de "contactado" que tienen que moverse juntos (ver api/leads/[id]/contacted). */
function marcaDeContacto(usuarioId: string) {
  return { contacted: true, contactedAt: new Date(), contactedById: usuarioId, followupStage: 3 };
}

function fechaValida(valor: unknown): Date | null {
  if (!valor) return null;
  const d = new Date(String(valor));
  return isNaN(d.getTime()) ? null : d;
}

export type CambioEtapa = {
  etapa: string;
  comentario?: string | null;
  motivoPerdida?: string | null;
  proximaAccion?: string | null;
  proximaAccionAt?: string | null;
};

export async function moverEtapa(leadId: string, usuario: { id: string; role?: string }, cambio: CambioEtapa) {
  const lead = await leadDelUsuario(leadId, usuario);
  const actual = canonico(lead.status);
  const etapa = canonico(cambio.etapa);

  if (!ETAPAS.some((e) => e.id === etapa)) throw new ErrorPipeline("Etapa desconocida");
  if (ESTADOS_CLIENTE.includes(actual)) {
    throw new ErrorPipeline("Este lead ya es cliente; su etapa la maneja el portal de pagos");
  }

  const cerrada = ETAPAS_CERRADAS.includes(etapa);
  const proximaAccion = (cambio.proximaAccion || "").trim().slice(0, 200) || null;
  const proximaAccionAt = fechaValida(cambio.proximaAccionAt);

  if (etapa === "PERDIDO" && !MOTIVOS_PERDIDA.includes(cambio.motivoPerdida || "")) {
    throw new ErrorPipeline("Elige el motivo por el que se perdió");
  }
  // La próxima acción es opcional al mover; si se indica, va con fecha.
  if (proximaAccion && !proximaAccionAt) {
    throw new ErrorPipeline("Indica la fecha de la próxima acción");
  }

  const comentario = (cambio.comentario || "").trim().slice(0, 500) || null;
  const motivo = etapa === "PERDIDO" ? [cambio.motivoPerdida, comentario].filter(Boolean).join(" — ") : comentario;

  return conAutor({ usuarioId: usuario.id, origen: "ASESOR", motivo }, async (tx) => {
    const data: any = {
      status: etapa,
      // Sin una próxima acción nueva, se conserva la que tenía (salvo al cerrar).
      proximaAccion: cerrada ? null : proximaAccion ?? undefined,
      proximaAccionAt: cerrada ? null : proximaAccionAt ?? undefined,
      motivoPerdida: etapa === "PERDIDO" ? cambio.motivoPerdida : null,
      lastActivity: `Etapa: ${etapa.charAt(0) + etapa.slice(1).toLowerCase()}`,
      lastNoteAt: new Date(),
    };
    if (ETAPAS_YA_CONTACTADO.includes(etapa) && !lead.contacted) Object.assign(data, marcaDeContacto(usuario.id));
    // Un lead perdido no puede seguir sonando en los recordatorios de seguimiento.
    if (etapa === "PERDIDO") data.followupStage = 3;

    return tx.lead.update({
      where: { id: leadId },
      data,
      select: { id: true, status: true, proximaAccion: true, proximaAccionAt: true, motivoPerdida: true, etapaDesde: true, contacted: true },
    });
  });
}

export type NuevoSeguimiento = {
  tipo: string;
  resultado?: string | null;
  nota?: string | null;
  proximaAccion?: string | null;
  proximaAccionAt?: string | null;
};

const TIPOS_CONTACTO = ["LLAMADA", "WHATSAPP", "CORREO", "VISITA", "REUNION"];

export async function registrarSeguimiento(leadId: string, usuario: { id: string; role?: string }, s: NuevoSeguimiento) {
  const lead = await leadDelUsuario(leadId, usuario);
  const tipo = canonico(s.tipo);
  if (!TIPOS_SEGUIMIENTO.some((t) => t.id === tipo)) throw new ErrorPipeline("Tipo de seguimiento desconocido");

  const resultado = (s.resultado || "").trim().slice(0, 100) || null;
  const nota = (s.nota || "").trim().slice(0, 2000) || null;
  const proximaAccion = (s.proximaAccion || "").trim().slice(0, 200) || null;
  const proximaAccionAt = fechaValida(s.proximaAccionAt);
  if (!resultado && !nota) throw new ErrorPipeline("Anota el resultado o una nota");
  if (proximaAccion && !proximaAccionAt) throw new ErrorPipeline("Indica la fecha de la próxima acción");

  const actual = canonico(lead.status);
  // Registrar una llamada o un WhatsApp es haber contactado: el lead sale de "Nuevo".
  const pasaAContactado = actual === "NUEVO" && TIPOS_CONTACTO.includes(tipo);

  return conAutor({ usuarioId: usuario.id, origen: "ASESOR", motivo: pasaAContactado ? "Primer contacto registrado" : null }, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO lead_seguimientos (lead_id, usuario_id, tipo, resultado, nota, proxima_accion, proxima_accion_at)
      VALUES (${leadId}, ${usuario.id}, ${tipo}, ${resultado}, ${nota}, ${proximaAccion}, ${proximaAccionAt})`;

    const nombreTipo = TIPOS_SEGUIMIENTO.find((t) => t.id === tipo)!.nombre;
    const data: any = {
      lastActivity: [nombreTipo, resultado].filter(Boolean).join(": "),
      lastNoteAt: new Date(),
    };
    if (proximaAccion && !ETAPAS_CERRADAS.includes(actual)) {
      data.proximaAccion = proximaAccion;
      data.proximaAccionAt = proximaAccionAt;
    }
    if (pasaAContactado) data.status = "CONTACTADO";
    if (TIPOS_CONTACTO.includes(tipo) && !lead.contacted) Object.assign(data, marcaDeContacto(usuario.id));

    return tx.lead.update({
      where: { id: leadId },
      data,
      select: { id: true, status: true, proximaAccion: true, proximaAccionAt: true, etapaDesde: true, contacted: true, lastActivity: true },
    });
  });
}

export type EventoHistorial = {
  clase: "ETAPA" | "SEGUIMIENTO";
  fecha: string;
  usuario: string | null;
  // ETAPA
  de?: string | null;
  a?: string;
  origen?: string;
  motivo?: string | null;
  // SEGUIMIENTO
  tipo?: string;
  resultado?: string | null;
  nota?: string | null;
  proximaAccion?: string | null;
  proximaAccionAt?: string | null;
};

/** Historial de un lead: cambios de etapa y seguimientos, del más nuevo al más viejo. */
export async function leerHistorial(leadId: string): Promise<EventoHistorial[]> {
  const filas: any[] = await prisma.$queryRaw`
    SELECT 'ETAPA' AS clase, h.created_at AS fecha, u.name AS usuario,
           h.de, h.a, h.origen, h.motivo,
           NULL AS tipo, NULL AS resultado, NULL AS nota, NULL AS proxima_accion, NULL::timestamp AS proxima_accion_at
      FROM lead_etapa_historial h LEFT JOIN "User" u ON u.id = h.usuario_id
     WHERE h.lead_id = ${leadId}
    UNION ALL
    SELECT 'SEGUIMIENTO', s.created_at, u.name,
           NULL, NULL, NULL, NULL,
           s.tipo, s.resultado, s.nota, s.proxima_accion, s.proxima_accion_at
      FROM lead_seguimientos s LEFT JOIN "User" u ON u.id = s.usuario_id
     WHERE s.lead_id = ${leadId}
     ORDER BY fecha DESC
     LIMIT 150`;

  return filas.map((f) => ({
    clase: f.clase,
    fecha: new Date(f.fecha).toISOString(),
    usuario: f.usuario,
    ...(f.clase === "ETAPA"
      ? { de: f.de, a: f.a, origen: f.origen, motivo: f.motivo }
      : {
          tipo: f.tipo,
          resultado: f.resultado,
          nota: f.nota,
          proximaAccion: f.proxima_accion,
          proximaAccionAt: f.proxima_accion_at ? new Date(f.proxima_accion_at).toISOString() : null,
        }),
  }));
}

// ---------------------------------------------------------------------------
// Tablero del pipeline
// ---------------------------------------------------------------------------

/** Los asesores que trabajan leads hoy; el administrador ve a estos tres. */
export const ASESORES_ACTIVOS = [MARCELA_ID, ORLANDO_ID, BARBARA_ID];

/**
 * El período filtra por "etapaDesde": un lead aparece si entró a su etapa
 * actual dentro de los últimos N días. Mismo criterio que el tablero del CRM
 * web (crm-alimin-web/app/api/pipeline).
 */
const POR_COLUMNA = 40;

const COLUMNA = `CASE WHEN upper(l.status) IN (${ESTADOS_CLIENTE.map((s) => `'${s}'`).join(",")}) THEN 'RESERVADO'
                      WHEN upper(l.status) IN (${ETAPAS.map((e) => `'${e.id}'`).join(",")}) THEN upper(l.status)
                      ELSE 'NUEVO' END`;

export type TarjetaPipeline = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string;
  columna: string;
  etapaDesde: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  banda: string | null;
  score: number | null;
  asesor: string | null;
  visitDate: string | null;
};

export async function leerTablero(asesores: string[], dias: number) {
  const filtro = `l."assignedToId" = ANY($1::text[])
                  AND l."etapaDesde" > (now() AT TIME ZONE 'UTC') - make_interval(days => $2::int)`;

  const conteos: { columna: string; leads: number }[] = await prisma.$queryRawUnsafe(
    `SELECT ${COLUMNA} AS columna, count(*)::int AS leads FROM "Lead" l WHERE ${filtro} GROUP BY 1`,
    asesores,
    dias
  );

  const filas: any[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM (
       SELECT l.id, l."firstName", l."lastName", l.phone, l.status, ${COLUMNA} AS columna,
              l."etapaDesde", l."proximaAccion", l."proximaAccionAt", l."visitDate",
              u.name AS asesor, s.banda, s.score,
              row_number() OVER (PARTITION BY ${COLUMNA} ORDER BY l."etapaDesde" DESC) AS n
         FROM "Lead" l
         LEFT JOIN "User" u ON u.id = l."assignedToId"
         LEFT JOIN public.lead_score s ON s.lead_id = l.id
        WHERE ${filtro}
     ) x WHERE n <= ${POR_COLUMNA}
     ORDER BY "etapaDesde" DESC`,
    asesores,
    dias
  );

  const iso = (d: any) => (d ? new Date(d).toISOString() : null);
  const tarjetas: TarjetaPipeline[] = filas.map((f) => ({
    id: f.id,
    nombre: [f.firstName, f.lastName].filter(Boolean).join(" ") || "Sin nombre",
    phone: f.phone,
    status: canonico(f.status),
    columna: f.columna,
    etapaDesde: iso(f.etapaDesde),
    proximaAccion: f.proximaAccion,
    proximaAccionAt: iso(f.proximaAccionAt),
    banda: f.banda,
    score: f.score,
    asesor: f.asesor,
    visitDate: iso(f.visitDate),
  }));

  return { conteos: Object.fromEntries(conteos.map((c) => [c.columna, c.leads])), tarjetas, porColumna: POR_COLUMNA };
}
