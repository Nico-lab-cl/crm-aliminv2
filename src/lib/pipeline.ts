import prisma from "./prisma";
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
  // Un lead abierto sin próxima acción es un lead olvidado: el pipeline no lo deja pasar.
  if (!cerrada && (!proximaAccion || !proximaAccionAt)) {
    throw new ErrorPipeline("Indica la próxima acción y su fecha");
  }

  const comentario = (cambio.comentario || "").trim().slice(0, 500) || null;
  const motivo = etapa === "PERDIDO" ? [cambio.motivoPerdida, comentario].filter(Boolean).join(" — ") : comentario;

  return conAutor({ usuarioId: usuario.id, origen: "ASESOR", motivo }, async (tx) => {
    const data: any = {
      status: etapa,
      proximaAccion: cerrada ? null : proximaAccion,
      proximaAccionAt: cerrada ? null : proximaAccionAt,
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
// Pantalla del pipeline
// ---------------------------------------------------------------------------

/**
 * Qué cuenta como lead "en el pipeline". Hay ~49.000 leads en NUEVO, casi todos
 * importaciones viejas, y ~4.500 en CONTACTADO porque se marca solo al
 * responder; mostrarlos taparía lo que sirve. Entra lo que está en una etapa
 * abierta desde hace menos de DIAS_ABIERTOS, todo lo que tenga próxima acción
 * (así un lead antiguo vuelve al agendarle algo desde la ficha), los clientes y
 * los perdidos recientes.
 */
const DIAS_ABIERTOS = 60;
const DIAS_PERDIDOS = 90;
const POR_PESTANA = 60;

// Fin del día de hoy en Chile, expresado como timestamp UTC (así se guardan las fechas).
const FIN_DE_HOY = `(((date_trunc('day', now() AT TIME ZONE 'America/Santiago') + interval '1 day') AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC')`;
const AHORA_UTC = `(now() AT TIME ZONE 'UTC')`;

const COLUMNA = `CASE WHEN upper(l.status) IN (${ESTADOS_CLIENTE.map((s) => `'${s}'`).join(",")}) THEN 'RESERVADO'
                      WHEN upper(l.status) IN (${ETAPAS.map((e) => `'${e.id}'`).join(",")}) THEN upper(l.status)
                      ELSE 'NUEVO' END`;

const EN_PIPELINE = `(CASE
  WHEN upper(l.status) IN ('RESERVADO', ${ESTADOS_CLIENTE.map((s) => `'${s}'`).join(",")}) THEN true
  WHEN upper(l.status) = 'PERDIDO' THEN l."etapaDesde" > ${AHORA_UTC} - interval '${DIAS_PERDIDOS} days'
  ELSE l."etapaDesde" > ${AHORA_UTC} - interval '${DIAS_ABIERTOS} days' OR l."proximaAccionAt" IS NOT NULL
END)`;

const ABIERTO = `upper(l.status) NOT IN (${ETAPAS_CERRADAS.map((s) => `'${s}'`).join(",")})`;

export type TarjetaPipeline = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string;
  columna: string;
  etapaDesde: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  ultimoSeguimiento: { tipo: string; resultado: string | null; fecha: string } | null;
  banda: string | null;
  score: number | null;
  asesor: string | null;
  visitDate: string | null;
};

export async function leerPipeline(asesorId: string | null, pestana: string) {
  const filtroAsesor = `($1::text IS NULL OR l."assignedToId" = $1)`;

  const [conteos]: any[] = await prisma.$queryRawUnsafe(
    `SELECT
       count(*) FILTER (WHERE ${ABIERTO} AND l."proximaAccionAt" < ${FIN_DE_HOY})::int AS "HOY",
       count(*) FILTER (WHERE ${ABIERTO} AND l."proximaAccionAt" < ${AHORA_UTC})::int AS "ATRASADOS",
       count(*) FILTER (WHERE ${ABIERTO} AND upper(l.status) <> 'NUEVO' AND l."proximaAccionAt" IS NULL)::int AS "SIN_ACCION",
       ${ETAPAS.map((e) => `count(*) FILTER (WHERE ${COLUMNA} = '${e.id}')::int AS "${e.id}"`).join(",\n       ")}
     FROM "Lead" l
     WHERE ${filtroAsesor} AND ${EN_PIPELINE}`,
    asesorId
  );

  let filtro: string;
  let orden: string;
  switch (pestana) {
    case "HOY":
      filtro = `${ABIERTO} AND l."proximaAccionAt" < ${FIN_DE_HOY}`;
      orden = `l."proximaAccionAt" ASC`;
      break;
    case "SIN_ACCION":
      filtro = `${ABIERTO} AND upper(l.status) <> 'NUEVO' AND l."proximaAccionAt" IS NULL`;
      // Arriba los que más vale la pena retomar.
      orden = `s.score DESC NULLS LAST, l."etapaDesde" DESC`;
      break;
    case "NUEVO":
      filtro = `${COLUMNA} = 'NUEVO'`;
      orden = `l."createdAt" DESC`;
      break;
    case "PERDIDO":
    case "RESERVADO":
      filtro = `${COLUMNA} = '${pestana}'`;
      orden = `l."etapaDesde" DESC NULLS LAST`;
      break;
    default:
      filtro = `${COLUMNA} = '${ETAPAS.find((e) => e.id === pestana)?.id ?? "CONTACTADO"}'`;
      orden = `l."proximaAccionAt" ASC NULLS LAST, s.score DESC NULLS LAST, l."etapaDesde" DESC`;
  }

  const filas: any[] = await prisma.$queryRawUnsafe(
    `SELECT l.id, l."firstName", l."lastName", l.phone, l.status, ${COLUMNA} AS columna,
            l."etapaDesde", l."proximaAccion", l."proximaAccionAt", l."visitDate",
            u.name AS asesor, s.banda, s.score,
            us.tipo AS us_tipo, us.resultado AS us_resultado, us.created_at AS us_fecha
       FROM "Lead" l
       LEFT JOIN "User" u ON u.id = l."assignedToId"
       LEFT JOIN public.lead_score s ON s.lead_id = l.id
       LEFT JOIN LATERAL (
         SELECT tipo, resultado, created_at FROM lead_seguimientos
          WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
       ) us ON true
      WHERE ${filtroAsesor} AND ${EN_PIPELINE} AND ${filtro}
      ORDER BY ${orden}
      LIMIT ${POR_PESTANA}`,
    asesorId
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
    ultimoSeguimiento: f.us_tipo ? { tipo: f.us_tipo, resultado: f.us_resultado, fecha: iso(f.us_fecha)! } : null,
    banda: f.banda,
    score: f.score,
    asesor: f.asesor,
    visitDate: iso(f.visitDate),
  }));

  return { conteos, tarjetas, total: conteos[pestana] ?? 0, porPestana: POR_PESTANA, diasAbiertos: DIAS_ABIERTOS };
}
