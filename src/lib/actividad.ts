import prisma from "./prisma";
import { queryMarketing } from "./marketingDb";

/**
 * Menú Actividad: los leads del asesor ordenados por temperatura del lead
 * score, con lo último que hicieron, y arriba los que están en la web ahora.
 *
 * El puntaje y la banda los calcula el CRM web cada 15 minutos en
 * public.lead_score; acá solo se leen, así que si cambian los cortes o las
 * temperaturas, esta pantalla las sigue sola. La actividad web y los correos
 * están en crm_marketing y se leen directo, sin esperar al cálculo: eso es lo
 * que la hace "en vivo".
 *
 * Las actividades se cuentan en castellano y sin datos técnicos. Se sacan los
 * clics de navegación (menú, enlaces internos): son ruido y taparían lo que
 * sirve para la llamada.
 */

/** Minutos sin actividad después de los cuales un lead ya no está "en la web ahora". */
export const MINUTOS_EN_VIVO = 5;
const DIAS_ACTIVIDAD = 30;
const ACTIVIDADES_POR_LEAD = 4;
const LEADS_POR_BANDA = 40;

export const ORDEN_BANDAS = ["CALIENTE", "TIBIO", "TEMPLADO", "FRIO"];

/** Mismo criterio que el lead score del CRM web para "botón de interés". */
const BOTON_INTERES = /cotiz|plano|lote|precio|agend|visita|reserv|simul|financ|brochure|ficha|disponib|cuota/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Actividad = { tipo: "WEB" | "WHATSAPP" | "INTERES" | "TIEMPO" | "CORREO" | "CHAT" | "FORM"; texto: string; fecha: string };

export type LeadActividad = {
  id: string;
  nombre: string;
  phone: string | null;
  status: string | null;
  contacted: boolean;
  score: number;
  banda: string;
  motivo: string | null;
  enVivo: { desde: string; pagina: string | null } | null;
  ultimaInteraccion: string | null;
  actividades: Actividad[];
};

// ---------------------------------------------------------------------------
// Nombres de las páginas de aliminspa.cl
// ---------------------------------------------------------------------------

const PAGINAS: [RegExp, string][] = [
  [/^\/$/, "la página de inicio"],
  [/^\/(proyectos\/lomas-del-mar|minipie|meta\/lomas-del-mar)\/?$/, "Lomas del Mar"],
  [/^\/(proyectos\/arena-y-sol|meta\/arena-y-sol)\/?$/, "Arena y Sol"],
  [/^\/proyectos\/libertad-y-alegria\/?$/, "Libertad y Alegría"],
  [/^\/proyectos\/?$/, "los proyectos"],
  [/^\/cotizar/, "el cotizador"],
  [/^\/agendar-visita/, "agendar visita"],
  [/^\/contacto/, "contacto"],
  [/^\/quienes-somos/, "quiénes somos"],
  [/^\/asesores/, "los asesores"],
  [/^\/(google\/|terrenos-|venta-de-terrenos)/, "terrenos en el litoral"],
  [/^\/sorteo/, "el sorteo"],
  [/^\/gracias/, "la página de gracias"],
];

function limpiarTitulo(titulo: string | null): string | null {
  const t = (titulo || "").split(/\s[|–-]\s/)[0].trim();
  return t ? t.slice(0, 50) : null;
}

export function nombrePagina(url: string | null, titulo: string | null): string {
  let ruta = "";
  let hash = "";
  try {
    const u = new URL(url || "");
    ruta = u.pathname;
    hash = decodeURIComponent(u.hash.replace(/^#/, "")).replace(/[-_]/g, " ").trim();
  } catch {
    return limpiarTitulo(titulo) || "la web";
  }
  if (ruta.startsWith("/blog/")) return `el blog: ${limpiarTitulo(titulo) || "un artículo"}`;
  const encontrada = PAGINAS.find(([re]) => re.test(ruta))?.[1];
  const nombre = encontrada || limpiarTitulo(titulo) || "la web";
  return hash && hash.length <= 30 ? `${nombre} (${hash})` : nombre;
}

// ---------------------------------------------------------------------------
// Traducción de cada evento
// ---------------------------------------------------------------------------

type FilaWeb = { lead_id: string; event_type: string; page_url: string | null; page_title: string | null; details: any; created_at: Date };

function actividadWeb(r: FilaWeb): Actividad | null {
  const fecha = new Date(r.created_at).toISOString();
  const pagina = nombrePagina(r.page_url, r.page_title);
  const d = r.details || {};
  switch (r.event_type) {
    case "PAGE_VISIT":
    case "PAGE_VIEW":
      return { tipo: "WEB", texto: `Entró ${pagina.startsWith("el ") ? `al ${pagina.slice(3)}` : `a ${pagina}`}`, fecha };
    case "PAGE_TIME": {
      const min = Math.round((Number(d.active_seconds) || 0) / 60);
      return min >= 1 ? { tipo: "TIEMPO", texto: `Estuvo ${min} min en ${pagina}`, fecha } : null;
    }
    case "CLICK_BUTTON": {
      const nombre = String(d.element_name || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (/wa\.me|whatsapp/i.test(`${d.href || ""} ${d.category || ""}`)) {
        return { tipo: "WHATSAPP", texto: `Tocó el botón de WhatsApp en ${pagina}`, fecha };
      }
      if (BOTON_INTERES.test(`${nombre} ${d.href || ""}`)) {
        return { tipo: "INTERES", texto: `Tocó "${nombre || "un botón"}" en ${pagina}`, fecha };
      }
      return null;
    }
    case "FORM_SUBMIT":
      return { tipo: "FORM", texto: `Envió un formulario en ${pagina}`, fecha };
    default:
      return null;
  }
}

function canal(p: string | null) {
  return p === "instagram" ? "Instagram" : p === "facebook" ? "Messenger" : p === "tiktok" ? "TikTok" : "el chat de la web";
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

let columnasLogs: Set<string> | null = null;
async function columnasCampaignLogs(): Promise<Set<string>> {
  if (!columnasLogs) {
    const r = await queryMarketing(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_logs'`
    );
    columnasLogs = new Set(r.rows.map((x: { column_name: string }) => x.column_name));
  }
  return columnasLogs;
}

/** Últimas actividades de cada lead, más recientes primero. */
async function actividadesDe(ids: string[]): Promise<Map<string, Actividad[]>> {
  const porLead = new Map<string, Actividad[]>();
  const agregar = (id: string, a: Actividad | null) => {
    if (!a) return;
    if (!porLead.has(id)) porLead.set(id, []);
    porLead.get(id)!.push(a);
  };
  const uuids = ids.filter((id) => UUID.test(id));
  if (!uuids.length) return porLead;

  const [web, correos, mensajes] = await Promise.all([
    queryMarketing(
      `SELECT lead_id::text AS lead_id, event_type, page_url, page_title, details, created_at
         FROM (
           SELECT *, row_number() OVER (PARTITION BY lead_id ORDER BY created_at DESC) AS n
             FROM lead_activities
            WHERE lead_id = ANY($1::uuid[])
              AND created_at > now() - make_interval(days => $2)
              AND event_type IN ('PAGE_VISIT', 'PAGE_VIEW', 'PAGE_TIME', 'CLICK_BUTTON', 'FORM_SUBMIT')
         ) a
        WHERE n <= 60`,
      [uuids, DIAS_ACTIVIDAD]
    ).catch((e) => {
      console.error("[actividad] lead_activities:", e.message);
      return { rows: [] as FilaWeb[] };
    }),
    (async () => {
      const cols = await columnasCampaignLogs();
      if (!cols.size) return { rows: [] as any[] };
      const clic = cols.has("last_clicked_at") ? "cl.last_clicked_at" : "NULL::timestamptz";
      const sinPruebas = cols.has("is_test") ? "AND COALESCE(cl.is_test, false) = false" : "";
      return queryMarketing(
        `SELECT cl.lead_id::text AS lead_id, cl.opened_at, ${clic} AS clicked_at, c.subject, c.title
           FROM campaign_logs cl
           JOIN campaigns c ON c.id = cl.campaign_id
          WHERE cl.lead_id = ANY($1::uuid[]) ${sinPruebas}
            AND (cl.opened_at > now() - make_interval(days => $2) OR ${clic} > now() - make_interval(days => $2))`,
        [uuids, DIAS_ACTIVIDAD]
      );
    })().catch((e) => {
      console.error("[actividad] campaign_logs:", e.message);
      return { rows: [] as any[] };
    }),
    // createdAt es timestamp sin zona escrito en UTC por Prisma.
    prisma
      .$queryRawUnsafe<{ lead_id: string; text: string | null; platform: string | null; fecha: Date }[]>(
        `SELECT c."leadId" AS lead_id, m.text, c.platform, (m."createdAt" AT TIME ZONE 'UTC') AS fecha
           FROM "Message" m
           JOIN "Conversation" c ON c.id = m."conversationId"
          WHERE c."leadId" = ANY($1::text[])
            AND m."senderType" IN ('meta', 'visitor')
            AND (m."createdAt" AT TIME ZONE 'UTC') > now() - make_interval(days => $2)
          ORDER BY m."createdAt" DESC
          LIMIT 300`,
        ids,
        DIAS_ACTIVIDAD
      )
      .catch((e) => {
        console.error("[actividad] mensajes:", e.message);
        return [];
      }),
  ]);

  for (const r of web.rows as FilaWeb[]) agregar(r.lead_id, actividadWeb(r));
  for (const r of correos.rows) {
    const asunto = String(r.subject || r.title || "una campaña").slice(0, 50);
    if (r.clicked_at) agregar(r.lead_id, { tipo: "CORREO", texto: `Hizo clic en el correo "${asunto}"`, fecha: new Date(r.clicked_at).toISOString() });
    else if (r.opened_at) agregar(r.lead_id, { tipo: "CORREO", texto: `Abrió el correo "${asunto}"`, fecha: new Date(r.opened_at).toISOString() });
  }
  for (const m of mensajes) {
    const texto = (m.text || "").replace(/\s+/g, " ").trim();
    agregar(m.lead_id, {
      tipo: "CHAT",
      texto: `Escribió por ${canal(m.platform)}${texto ? `: "${texto.slice(0, 60)}${texto.length > 60 ? "…" : ""}"` : ""}`,
      fecha: new Date(m.fecha).toISOString(),
    });
  }

  // Más recientes primero y sin repetir lo mismo seguido (recargas de página,
  // varias pestañas): una línea por cosa distinta.
  porLead.forEach((lista, id) => {
    lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const vistas = new Set<string>();
    porLead.set(
      id,
      lista.filter((a) => (vistas.has(a.texto) ? false : (vistas.add(a.texto), true))).slice(0, ACTIVIDADES_POR_LEAD)
    );
  });
  return porLead;
}

/** Leads con un evento web en los últimos minutos, y la página donde están. */
async function enLaWebAhora(): Promise<Map<string, { desde: string; pagina: string | null }>> {
  const r = await queryMarketing(
    `SELECT DISTINCT ON (lead_id) lead_id::text AS lead_id, created_at, page_url, page_title
       FROM lead_activities
      WHERE lead_id IS NOT NULL
        AND created_at > now() - make_interval(mins => $1)
      ORDER BY lead_id, created_at DESC`,
    [MINUTOS_EN_VIVO]
  ).catch((e) => {
    console.error("[actividad] en vivo:", e.message);
    return { rows: [] as any[] };
  });
  return new Map(
    r.rows.map((x: any) => [x.lead_id, { desde: new Date(x.created_at).toISOString(), pagina: nombrePagina(x.page_url, x.page_title) }])
  );
}

type FilaScore = {
  lead_id: string;
  score: number;
  banda: string;
  motivos: unknown;
  ultima_interaccion: Date | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string | null;
  contacted: boolean;
};

/**
 * Datos de la pantalla. `asesorId` null = todos (administrador).
 * `banda` elige la pestaña; los "en la web ahora" vienen siempre.
 */
export async function leerActividad(asesorId: string | null, banda: string) {
  const tabla: { existe: boolean }[] = await prisma.$queryRaw`
    SELECT to_regclass('public.lead_score') IS NOT NULL AS existe`;
  if (!tabla[0]?.existe) return { listo: false as const };

  const filas = await prisma.$queryRawUnsafe<FilaScore[]>(
    `SELECT s.lead_id, s.score, s.banda, s.motivos, s.ultima_interaccion,
            l."firstName", l."lastName", l.phone, l.status, COALESCE(l.contacted, false) AS contacted
       FROM public.lead_score s
       JOIN "Lead" l ON l.id = s.lead_id
      WHERE ($1::text IS NULL OR l."assignedToId" = $1)
      ORDER BY s.score DESC, s.ultima_interaccion DESC NULLS LAST`,
    asesorId
  );

  const conteo: Record<string, number> = {};
  for (const f of filas) conteo[f.banda] = (conteo[f.banda] || 0) + 1;
  const bandas = [...ORDEN_BANDAS, ...Object.keys(conteo).filter((b) => !ORDEN_BANDAS.includes(b))].map((b) => ({
    banda: b,
    leads: conteo[b] || 0,
  }));

  const vivos = await enLaWebAhora();
  const enVivo = filas.filter((f) => vivos.has(f.lead_id));
  const deBanda = filas.filter((f) => f.banda === banda).slice(0, LEADS_POR_BANDA);

  const ids = Array.from(new Set([...enVivo, ...deBanda].map((f) => f.lead_id)));
  const actividades = await actividadesDe(ids);

  const armar = (f: FilaScore): LeadActividad => {
    const motivos = Array.isArray(f.motivos) ? (f.motivos as unknown[]).filter((m): m is string => typeof m === "string") : [];
    return {
      id: f.lead_id,
      nombre: [f.firstName, f.lastName].filter(Boolean).join(" ") || "Sin nombre",
      phone: f.phone,
      status: f.status,
      contacted: f.contacted,
      score: f.score,
      banda: f.banda,
      // El primero es el origen ("Llegó por la web"); el segundo, lo que más pesó.
      motivo: motivos[1] || motivos[0] || null,
      enVivo: vivos.get(f.lead_id) || null,
      ultimaInteraccion: f.ultima_interaccion ? new Date(f.ultima_interaccion).toISOString() : null,
      actividades: actividades.get(f.lead_id) || [],
    };
  };

  return {
    listo: true as const,
    minutosEnVivo: MINUTOS_EN_VIVO,
    bandas,
    enVivo: enVivo.map(armar).sort((a, b) => (b.enVivo!.desde > a.enVivo!.desde ? 1 : -1)),
    leads: deBanda.map(armar),
    total: conteo[banda] || 0,
  };
}
