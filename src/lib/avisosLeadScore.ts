import prisma from "./prisma";
import { createNotification } from "./notifications";
import { MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";
import {
  ASESORES_ANUNCIABLES,
  EvolutionRechazo,
  MAX_INTENTOS,
  enviarAlGrupo,
  leerConfig,
  type Config,
} from "./avisosWhatsappLeads";

/**
 * Avisos del lead score: push al asesor dueño y mensaje al grupo "Leads | Alimin".
 *
 * El puntaje no se calcula aca. Lo calcula el CRM web cada 15 minutos (es el
 * unico que ve las dos bases: correos y visitas web en crm_marketing, leads y
 * chats en crm) y lo deja en public.lead_score. Este modulo solo lo lee.
 *
 * Tres avisos:
 *   - RESUMEN a las 9:00 de Chile: los 5 calientes de cada asesor.
 *   - CALIENTE en el momento en que un lead cruza a caliente. Un mismo lead se
 *     avisa como maximo una vez cada 72 horas.
 *   - SIN_ATENDER si el lead caliente sigue sin marcarse como contactado 4
 *     horas despues. Solo se notifica: no se reasigna (decision del equipo).
 *
 * Entre las 21:00 y las 9:00 no sale nada: lo que se calento de noche entra
 * en el resumen de la mañana, y el resumen lo da por avisado para que a las
 * 9:01 no salga una rafaga de avisos sueltos.
 *
 * Lo que se publica: nombre del lead, puntaje y el porque. NUNCA telefono ni
 * correo: en el grupo estan todos los asesores y podrian aprovecharse. El
 * asesor busca al lead por nombre en el CRM.
 *
 * Solo leads asignados a Marcela, Orlando o Bárbara. Los sin asesor o de
 * usuarios que ya no estan no se avisan nunca, ni como "sin dueño": decision
 * del equipo (el CRM web tampoco les calcula puntaje).
 *
 * Interruptor: LEAD_SCORE_AVISOS_DESDE (fecha). Sin ella no sale ningun aviso.
 * Los avisos en el momento solo cubren leads que se calentaron despues de esa
 * fecha, asi el primer despliegue no anuncia de golpe a todos los calientes.
 */

const HORA_INICIO = 9;
const HORA_FIN = 21;
const SIN_ATENDER_TRAS_H = 4;
const ENFRIAMIENTO_H = 72;
const TOP_POR_ASESOR = 5;
/** Un lead que no interactua hace 45 dias deja de avisarse aunque siga con puntaje. */
const DIAS_VIVO = 45;

const MAX_POR_CORRIDA = 5;
const PAUSA_ENTRE_ENVIOS_MS = 3000;

const NOMBRE_ASESOR: Record<string, string> = {
  [MARCELA_ID]: "Marcela",
  [ORLANDO_ID]: "Orlando",
  [BARBARA_ID]: "Bárbara",
};

export type Evento = "CALIENTE" | "SIN_ATENDER" | "RESUMEN" | "CUBIERTO";

type FilaCaliente = {
  lead_id: string;
  score: number;
  motivos: unknown;
  caliente_desde: Date;
  firstName: string | null;
  lastName: string | null;
  assignedToId: string | null;
  contacted: boolean;
};

// ---------------------------------------------------------------------------
// Configuracion y tablas
// ---------------------------------------------------------------------------

function leerDesde(): Date | null {
  const texto = process.env.LEAD_SCORE_AVISOS_DESDE;
  if (!texto) return null;
  const desde = new Date(texto);
  if (isNaN(desde.getTime())) {
    console.error(`[lead-score] LEAD_SCORE_AVISOS_DESDE no es una fecha valida: "${texto}"`);
    return null;
  }
  return desde;
}

/**
 * La tabla de registro se crea sola: un paso manual olvidado en la base es lo
 * que mas veces boto la bandeja. Esta fuera de schema.prisma igual que
 * whatsapp_lead_avisos. El SQL tambien queda en crm-alimin-web,
 * scripts/setup_lead_score.sql.
 */
let tablaAvisosLista = false;
async function asegurarTablaAvisos() {
  if (tablaAvisosLista) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.lead_score_avisos (
      id            bigserial PRIMARY KEY,
      clave         text NOT NULL UNIQUE,
      evento        text NOT NULL,
      lead_id       text,
      asesor_id     text,
      texto         text NOT NULL DEFAULT '',
      estado        text NOT NULL DEFAULT 'PENDIENTE',
      intentos      integer NOT NULL DEFAULT 1,
      error         text,
      wa_message_id text,
      creado_en     timestamptz NOT NULL DEFAULT now(),
      enviado_en    timestamptz
    )`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_lead_score_avisos_lead ON public.lead_score_avisos (lead_id, evento, creado_en DESC)`
  );
  tablaAvisosLista = true;
}

/** public.lead_score la crea el CRM web; hasta su primer calculo no hay nada que avisar. */
async function hayScores(): Promise<boolean> {
  const r: { existe: boolean }[] = await prisma.$queryRaw`
    SELECT to_regclass('public.lead_score') IS NOT NULL AS existe`;
  return Boolean(r[0]?.existe);
}

// ---------------------------------------------------------------------------
// Hora de Chile
// ---------------------------------------------------------------------------

function partesChile(fecha: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  const p = (tipo: string) => Number(partes.find((x) => x.type === tipo)?.value);
  return { anio: p("year"), mes: p("month"), dia: p("day"), hora: p("hour") % 24, minuto: p("minute") };
}

function fechaChile(fecha = new Date()) {
  const { anio, mes, dia } = partesChile(fecha);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Instante (UTC) en que hoy son las HORA_INICIO en Chile. */
function inicioVentanaHoy(ahora = new Date()): Date {
  const { anio, mes, dia, hora, minuto } = partesChile(ahora);
  const desfase = Date.UTC(anio, mes - 1, dia, hora, minuto) - Math.floor(ahora.getTime() / 60000) * 60000;
  return new Date(Date.UTC(anio, mes - 1, dia, HORA_INICIO) - desfase);
}

function enHorario(ahora = new Date()) {
  const { hora } = partesChile(ahora);
  return hora >= HORA_INICIO && hora < HORA_FIN;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

function nombre(fila: Pick<FilaCaliente, "firstName" | "lastName">) {
  return [fila.firstName, fila.lastName].filter(Boolean).join(" ").trim() || "Sin nombre";
}

function motivosDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((m): m is string => typeof m === "string");
  if (typeof valor === "string") {
    try {
      return motivosDe(JSON.parse(valor));
    } catch {
      return [];
    }
  }
  return [];
}

function tieneDueno(fila: Pick<FilaCaliente, "assignedToId">) {
  return Boolean(fila.assignedToId && ASESORES_ANUNCIABLES.includes(fila.assignedToId));
}

function dueno(fila: Pick<FilaCaliente, "assignedToId">) {
  return tieneDueno(fila) ? NOMBRE_ASESOR[fila.assignedToId!] : null;
}

/** Sin el origen ("Llegó por la web"): en el push hay poco espacio y lo que importa es la interaccion. */
function motivosCortos(fila: FilaCaliente, cuantos: number) {
  return motivosDe(fila.motivos).slice(1, 1 + cuantos).join(", ");
}

export function textoCaliente(fila: FilaCaliente): string {
  const quien = dueno(fila);
  return [
    `🔥 *Lead caliente* · ${fila.score} pts`,
    `👤 *${nombre(fila)}*`,
    `💡 ${motivosDe(fila.motivos).join(" · ")}`,
    `👨‍💼 Para: ${quien}`,
  ].join("\n");
}

export function textoSinAtender(fila: FilaCaliente): string {
  return [
    `⏰ *Lead caliente sin atender (${SIN_ATENDER_TRAS_H} h)*`,
    `👤 ${nombre(fila)} · ${fila.score} pts`,
    `👨‍💼 ${dueno(fila)} aún no lo marca como contactado`,
  ].join("\n");
}

export function textoResumen(filas: FilaCaliente[], fecha: string, prueba = false): string | null {
  if (!filas.length) return null;
  const [anio, mes, dia] = fecha.split("-");
  const lineas = [`${prueba ? "🧪 *PRUEBA* · " : ""}🔥 *Leads calientes de hoy* (${dia}-${mes}-${anio})`];

  const linea = (f: FilaCaliente, i: number) =>
    `${i + 1}. ${nombre(f)} · ${f.score} pts${motivosCortos(f, 2) ? ` · ${motivosCortos(f, 2)}` : ""}`;

  for (const id of ASESORES_ANUNCIABLES) {
    const suyos = filas.filter((f) => f.assignedToId === id);
    if (!suyos.length) continue;
    lineas.push("", `👨‍💼 *${NOMBRE_ASESOR[id]}* · ${suyos.length} caliente${suyos.length === 1 ? "" : "s"}`);
    suyos.slice(0, TOP_POR_ASESOR).forEach((f, i) => lineas.push(linea(f, i)));
  }

  lineas.push("", "Búscalos por nombre en el CRM.");
  return lineas.join("\n");
}

// ---------------------------------------------------------------------------
// Registro y envio
// ---------------------------------------------------------------------------

/**
 * Reclama un aviso antes de mandarlo (misma logica que whatsapp_lead_avisos):
 * la clave unica impide que dos pasadas, o dos replicas, lo manden dos veces.
 * Uno que quedo PENDIENTE no se reintenta: no se sabe si alcanzo a salir.
 */
async function reclamar(
  clave: string, evento: Evento, leadId: string | null, asesorId: string | null, texto: string
): Promise<bigint | null> {
  const nuevo: { id: bigint }[] = await prisma.$queryRaw`
    INSERT INTO public.lead_score_avisos (clave, evento, lead_id, asesor_id, texto, estado, intentos)
    VALUES (${clave}, ${evento}, ${leadId}, ${asesorId}, ${texto}, 'PENDIENTE', 1)
    ON CONFLICT (clave) DO NOTHING
    RETURNING id`;
  if (nuevo.length) return nuevo[0].id;

  const reintento: { id: bigint }[] = await prisma.$queryRaw`
    UPDATE public.lead_score_avisos
       SET estado = 'PENDIENTE', intentos = intentos + 1, texto = ${texto}, error = NULL
     WHERE clave = ${clave} AND estado = 'ERROR' AND intentos < ${MAX_INTENTOS}
    RETURNING id`;
  return reintento.length ? reintento[0].id : null;
}

/** Publica en el grupo y deja constancia. Sin grupo configurado, el push basta. */
async function publicar(registroId: bigint, texto: string, cfg: Config | null): Promise<boolean> {
  if (!cfg) {
    await prisma.$executeRaw`
      UPDATE public.lead_score_avisos
         SET estado = 'ENVIADO', enviado_en = now(), error = 'Grupo de WhatsApp sin configurar: solo push'
       WHERE id = ${registroId}`;
    return true;
  }
  try {
    const waId = await enviarAlGrupo(texto, cfg);
    await prisma.$executeRaw`
      UPDATE public.lead_score_avisos
         SET estado = 'ENVIADO', wa_message_id = ${waId}, enviado_en = now()
       WHERE id = ${registroId}`;
    return true;
  } catch (error: any) {
    console.error(`[lead-score] Fallo el envio al grupo (registro ${registroId}):`, error);
    const reintentable = error instanceof EvolutionRechazo;
    const detalle = reintentable
      ? String(error.message)
      : `Sin respuesta de Evolution (puede haberse publicado, no se reintenta): ${error?.message || error}`;
    await prisma.$executeRaw`
      UPDATE public.lead_score_avisos
         SET estado = 'ERROR', error = ${detalle.slice(0, 1000)},
             intentos = CASE WHEN ${reintentable} THEN intentos ELSE ${MAX_INTENTOS} END
       WHERE id = ${registroId}`;
    return false;
  }
}

/** El push nunca bloquea el aviso al grupo: si falla, queda en el log. */
async function push(userId: string, title: string, body: string, leadId: string) {
  try {
    await createNotification({ userId, title, body, type: "LEAD_SCORE", leadId });
  } catch (error) {
    console.error(`[lead-score] Fallo el push a ${userId}:`, error);
  }
}

const claveEpisodio = (fila: FilaCaliente) => `${fila.lead_id}:${fila.caliente_desde.toISOString()}`;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

async function leerCalientes(): Promise<FilaCaliente[]> {
  return prisma.$queryRaw<FilaCaliente[]>`
    SELECT s.lead_id, s.score, s.motivos, s.caliente_desde,
           l."firstName", l."lastName", l."assignedToId", COALESCE(l.contacted, false) AS contacted
      FROM public.lead_score s
      JOIN "Lead" l ON l.id = s.lead_id
     WHERE s.banda = 'CALIENTE'
       AND s.caliente_desde IS NOT NULL
       AND l."assignedToId" = ANY(${ASESORES_ANUNCIABLES})
       AND s.ultima_interaccion > now() - make_interval(days => ${DIAS_VIVO}::int)
     ORDER BY s.score DESC, s.ultima_interaccion DESC`;
}

// ---------------------------------------------------------------------------
// Pasada
// ---------------------------------------------------------------------------

async function enviarResumen(filas: FilaCaliente[], cfg: Config | null, fecha: string, prueba: boolean) {
  const texto = textoResumen(filas, fecha, prueba);
  const clave = prueba ? `PRUEBA:RESUMEN:${new Date().toISOString()}` : `RESUMEN:${fecha}`;

  if (!texto) {
    // Dia sin calientes: no se manda nada, pero queda constancia para no
    // volver a evaluarlo en cada pasada.
    if (!prueba) {
      await prisma.$executeRaw`
        INSERT INTO public.lead_score_avisos (clave, evento, texto, estado, intentos, error)
        VALUES (${clave}, 'RESUMEN', '', 'ENVIADO', 1, 'Sin leads calientes')
        ON CONFLICT (clave) DO NOTHING`;
    }
    return false;
  }

  const registroId = await reclamar(clave, "RESUMEN", null, null, texto);
  if (registroId === null) return false;

  // La prueba solo va al grupo: no se les hace sonar el celular a los asesores.
  for (const id of prueba ? [] : ASESORES_ANUNCIABLES) {
    const suyos = filas.filter((f) => f.assignedToId === id);
    if (!suyos.length) continue;
    const top = suyos.slice(0, 3).map((f) => `${nombre(f)} (${f.score})`).join(", ");
    await push(
      id,
      `🔥 ${suyos.length} lead${suyos.length === 1 ? "" : "s"} caliente${suyos.length === 1 ? "" : "s"} para hoy`,
      `${top}${suyos.length > 3 ? "…" : ""}`,
      suyos[0].lead_id
    );
  }

  const enviado = await publicar(registroId, texto, cfg);

  // Todo lo que entro en el resumen queda avisado: sin esto, a las 9:01
  // saldria un aviso suelto por cada lead que se calento de noche.
  if (enviado && !prueba) {
    for (const f of filas) {
      await prisma.$executeRaw`
        INSERT INTO public.lead_score_avisos (clave, evento, lead_id, asesor_id, texto, estado, enviado_en)
        VALUES (${`CALIENTE:${claveEpisodio(f)}`}, 'CUBIERTO', ${f.lead_id}, ${f.assignedToId}, '', 'ENVIADO', now())
        ON CONFLICT (clave) DO NOTHING`;
    }
  }
  return enviado;
}

/**
 * Corre una pasada. Pensada para el temporizador de cada minuto de
 * instrumentation.ts; es segura de repetir a cualquier frecuencia.
 */
export async function runAvisosLeadScore() {
  const desde = leerDesde();
  if (!desde) return { activo: false, enviados: 0 };
  if (!(await hayScores())) return { activo: true, enviados: 0 };
  await asegurarTablaAvisos();

  const ahora = new Date();
  if (!enHorario(ahora)) return { activo: true, enviados: 0 };

  const cfg = leerConfig();
  const calientes = await leerCalientes();
  let enviados = 0;

  // 1) Resumen de la mañana (o la primera pasada del dia en horario, si el
  //    CRM estaba caido a las 9).
  const fecha = fechaChile(ahora);
  const yaResumido: { n: number }[] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.lead_score_avisos WHERE clave = ${`RESUMEN:${fecha}`}`;
  if (!yaResumido[0]?.n) {
    if (await enviarResumen(calientes, cfg, fecha, false)) enviados++;
    return { activo: true, enviados };
  }

  let presupuesto = MAX_POR_CORRIDA;

  // 2) Recien calientes. Se avisa una vez por episodio y no mas de una vez
  //    cada 72 horas por lead, aunque entre y salga de caliente.
  const ya: { lead_id: string }[] = calientes.length
    ? await prisma.$queryRaw`
        SELECT DISTINCT lead_id FROM public.lead_score_avisos
         WHERE evento IN ('CALIENTE', 'CUBIERTO')
           AND lead_id = ANY(${calientes.map((f) => f.lead_id)})
           AND (estado = 'ENVIADO' OR estado = 'PENDIENTE' OR intentos >= ${MAX_INTENTOS})
           AND creado_en > now() - make_interval(hours => ${ENFRIAMIENTO_H}::int)`
    : [];
  const avisados = new Set(ya.map((r) => r.lead_id));
  const limiteReciente = Date.now() - 24 * 3600 * 1000;

  const nuevos = calientes.filter(
    (f) =>
      !avisados.has(f.lead_id) &&
      f.caliente_desde.getTime() >= desde.getTime() &&
      f.caliente_desde.getTime() >= limiteReciente
  );

  for (const f of nuevos) {
    if (presupuesto <= 0) break;
    const texto = textoCaliente(f);
    const registroId = await reclamar(`CALIENTE:${claveEpisodio(f)}`, "CALIENTE", f.lead_id, f.assignedToId, texto);
    if (registroId === null) continue;

    if (presupuesto < MAX_POR_CORRIDA) await pausa(PAUSA_ENTRE_ENVIOS_MS);
    presupuesto--;
    if (tieneDueno(f)) {
      await push(f.assignedToId!, `🔥 Lead caliente: ${nombre(f)}`, `${f.score} pts · ${motivosCortos(f, 3)}`, f.lead_id);
    }
    if (await publicar(registroId, texto, cfg)) enviados++;
  }

  // 3) Calientes con dueño que siguen sin contactar. Las 4 horas cuentan desde
  //    que se calento o desde las 9:00 de hoy, lo que sea mas tarde: un lead
  //    que se calento de noche no puede amanecer "sin atender".
  const inicioHoy = inicioVentanaHoy(ahora).getTime();
  const plazo = SIN_ATENDER_TRAS_H * 3600 * 1000;
  const pendientes = calientes.filter(
    (f) =>
      tieneDueno(f) &&
      !f.contacted &&
      f.caliente_desde.getTime() >= desde.getTime() &&
      Math.max(f.caliente_desde.getTime(), inicioHoy) + plazo <= ahora.getTime()
  );

  for (const f of pendientes) {
    if (presupuesto <= 0) break;
    const texto = textoSinAtender(f);
    const registroId = await reclamar(`SIN_ATENDER:${claveEpisodio(f)}`, "SIN_ATENDER", f.lead_id, f.assignedToId, texto);
    if (registroId === null) continue;

    if (presupuesto < MAX_POR_CORRIDA) await pausa(PAUSA_ENTRE_ENVIOS_MS);
    presupuesto--;
    await push(
      f.assignedToId!,
      `⏰ Lead caliente sin atender: ${nombre(f)}`,
      `Lleva ${SIN_ATENDER_TRAS_H} h caliente. Márcalo como contactado cuando lo llames.`,
      f.lead_id
    );
    if (await publicar(registroId, texto, cfg)) enviados++;
  }

  return { activo: true, enviados };
}

/**
 * Prueba manual (/api/cron/lead-whatsapp?probar=score o score-vista).
 * "vista" devuelve el texto sin mandar nada; "enviar" publica el resumen
 * marcado como PRUEBA, sin ocupar el lugar del resumen real del dia.
 */
export async function probarResumenScore(modo: "vista" | "enviar") {
  if (!(await hayScores())) return { ok: false, motivo: "Todavía no existe public.lead_score (el CRM web no ha calculado)." };
  await asegurarTablaAvisos();
  const calientes = await leerCalientes();
  const fecha = fechaChile();
  if (modo === "vista") {
    return { ok: true, calientes: calientes.length, texto: textoResumen(calientes, fecha, true) };
  }
  const enviado = await enviarResumen(calientes, leerConfig(), fecha, true);
  return { ok: enviado, calientes: calientes.length };
}
