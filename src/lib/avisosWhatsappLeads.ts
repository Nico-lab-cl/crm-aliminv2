import prisma from "./prisma";
import { MARCELA_ID, ORLANDO_ID, BARBARA_ID } from "./assignment";

/**
 * Avisos de leads al grupo de WhatsApp del equipo ("Leads | Alimin").
 *
 * Manda dos avisos por lead, por la instancia de Evolution API:
 *   - LEAD_NUEVO: en cuanto el lead tiene asesor.
 *   - LEAD_SIN_ATENDER: 30 minutos despues del aviso nuevo, si el asesor
 *     todavia no lo marco como contactado.
 *
 * Lo que se publica y lo que no:
 *   - En el grupo estan todos los asesores, asi que NUNCA va el telefono ni el
 *     correo del cliente: solo nombre, de donde viene, la nota y el asesor.
 *   - Solo se anuncian leads ya asignados a un asesor de la rueda. Un lead sin
 *     dueño en el grupo invita a que dos asesores lo llamen a la vez.
 *   - Solo leads de anuncios y de la web. Importaciones CSV, Newsletter y los
 *     leads cargados a mano no son "leads que llegaron" y no se anuncian.
 *
 * Cada aviso queda en public.whatsapp_lead_avisos (base crm), con el texto
 * exacto, el id del mensaje que devuelve Evolution y el error si fallo. Esa
 * tabla NO esta en schema.prisma a proposito: es un registro, nadie la lee
 * desde el CRM, y asi no obliga a regenerar el cliente. Se creo a mano:
 *
 *   CREATE TABLE public.whatsapp_lead_avisos (... UNIQUE (lead_id, evento))
 *
 * La clave unica (lead_id, evento) es la que hace seguro repetir la pasada:
 * el aviso se reclama con un INSERT ... ON CONFLICT DO NOTHING antes de
 * enviarlo, asi que dos corridas simultaneas (o dos replicas del CRM) nunca
 * mandan el mismo aviso dos veces.
 */

/** Asesores de la rueda. Los leads de otros usuarios (Nicolas, admins) no se anuncian. */
const ASESORES_ANUNCIABLES = [MARCELA_ID, ORLANDO_ID, BARBARA_ID];

const SIN_ATENDER_TRAS_MS = 30 * 60 * 1000;

/**
 * Cuanto hacia atras se mira. Mismo motivo que en followups.ts: un backfill o
 * un restore de la base no puede revivir leads viejos y llenar el grupo.
 */
const ANTIGUEDAD_MAXIMA_MS = 3 * 24 * 60 * 60 * 1000;

/** Un mensaje fallido se reintenta en pasadas siguientes hasta este tope. */
const MAX_INTENTOS = 3;

/**
 * Tope de mensajes por pasada y pausa entre uno y otro. WhatsApp castiga las
 * rafagas: si se acumulan avisos, salen de a poco en las pasadas siguientes.
 */
const MAX_POR_CORRIDA = 10;
const PAUSA_ENTRE_ENVIOS_MS = 3000;

type Config = {
  url: string;
  apiKey: string;
  instancia: string;
  grupo: string;
  desde: Date;
};

/**
 * Lee la configuracion. Si falta algo, los avisos quedan apagados y la pasada
 * no hace nada: es el interruptor para activarlos o detenerlos sin desplegar.
 *
 * LEADS_WHATSAPP_DESDE es obligatoria a proposito. Es la fecha desde la que se
 * anuncia; sin ella, el primer despliegue anunciaria de golpe los leads de los
 * ultimos tres dias.
 */
function leerConfig(): Config | null {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE || "nico";
  const grupo = process.env.LEADS_WHATSAPP_GROUP;
  const desdeTexto = process.env.LEADS_WHATSAPP_DESDE;

  if (!url || !apiKey || !grupo || !desdeTexto) return null;

  const desde = new Date(desdeTexto);
  if (isNaN(desde.getTime())) {
    console.error(`[avisos-whatsapp] LEADS_WHATSAPP_DESDE no es una fecha valida: "${desdeTexto}"`);
    return null;
  }

  return { url, apiKey, instancia, grupo, desde };
}

type LeadAviso = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
  notes: string | null;
  comoConocio: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  adId: string | null;
  adName: string | null;
  formId: string | null;
  createdAt: Date;
  assignedTo: { name: string | null } | null;
};

const SELECT_LEAD = {
  id: true,
  firstName: true,
  lastName: true,
  source: true,
  notes: true,
  comoConocio: true,
  utmSource: true,
  utmMedium: true,
  adId: true,
  adName: true,
  formId: true,
  createdAt: true,
  assignedTo: { select: { name: true } },
};

// ---------------------------------------------------------------------------
// Traduccion del origen a lenguaje del equipo
// ---------------------------------------------------------------------------

type TipoLead = "ANUNCIO" | "WEB";

const minus = (s: string | null | undefined) => (s || "").trim().toLowerCase();

function esInstagram(s: string) {
  return s === "ig" || s.includes("instagram");
}

function esFacebook(s: string) {
  return s === "fb" || s.includes("facebook");
}

/**
 * Clasifica el lead. Devuelve null si no es de anuncio ni de la web, y en ese
 * caso no se anuncia.
 */
export function tipoDeLead(lead: Pick<LeadAviso, "source" | "adId" | "adName" | "formId">): TipoLead | null {
  const fuente = minus(lead.source);

  if (lead.formId || lead.adId || lead.adName) return "ANUNCIO";
  if (fuente === "meta" || esInstagram(fuente) || esFacebook(fuente)) return "ANUNCIO";

  if (fuente.includes("aliminspa") || fuente.includes("lomasdelmar") || fuente === "web" || fuente === "sitio web") {
    return "WEB";
  }

  return null;
}

/**
 * "De donde viene" en palabras que entiende cualquiera del equipo.
 *
 * No hay anuncios pagados en Google: todo lo que llega de Google es busqueda.
 */
export function deDondeViene(
  lead: Pick<LeadAviso, "source" | "utmSource" | "utmMedium" | "adId" | "adName" | "formId">
): string {
  const fuente = minus(lead.source);
  const utm = minus(lead.utmSource);
  const medio = minus(lead.utmMedium);

  if (tipoDeLead(lead) === "ANUNCIO") {
    const plataforma = `${utm} ${fuente}`;
    if (esInstagram(utm) || esInstagram(fuente) || plataforma.includes("instagram")) {
      return "Formulario de anuncio en Instagram";
    }
    if (esFacebook(utm) || esFacebook(fuente)) return "Formulario de anuncio en Facebook";
    return "Formulario de anuncio en Facebook / Instagram";
  }

  const pagado = /paid|cpc|ppc|cpm|ads?\b|pago|pagado/.test(medio);

  if (utm || medio) {
    if (esInstagram(utm)) return pagado ? "Anuncio pagado en Instagram" : "Publicación de Instagram";
    if (esFacebook(utm)) return pagado ? "Anuncio pagado en Facebook" : "Publicación de Facebook";
    if (utm === "meta") return "Anuncio pagado en Facebook / Instagram";
    if (utm.includes("tiktok")) return pagado ? "Anuncio en TikTok" : "Publicación de TikTok";
    if (utm.includes("google")) return "Búsqueda en Google";
    if (utm.includes("email") || utm.includes("newsletter") || utm.includes("mail") || medio === "email") {
      return "Correo de Alimin";
    }
    if (utm === "qr" || medio === "qr") return "Código QR";
    if (utm.includes("whatsapp")) return "Enlace compartido por WhatsApp";
    return `Enlace de ${lead.utmSource || lead.utmMedium}`;
  }

  if (fuente.includes("chat web")) return "Chat de la web";
  if (fuente.includes("lomasdelmar")) return "Agendó una visita en la web";
  return "Entró directo a la web";
}

/** Los formularios guardan algunas respuestas abreviadas. */
const COMO_CONOCIO_LEGIBLE: Record<string, string> = {
  "recomendación": "Recomendación de un amigo",
  "recomendacion": "Recomendación de un amigo",
  google: "Google / Búsqueda web",
};

function comoNosConocio(valor: string | null): string | null {
  const limpio = valor?.trim();
  if (!limpio) return null;
  return COMO_CONOCIO_LEGIBLE[limpio.toLowerCase()] || limpio;
}

function nombreDelLead(lead: Pick<LeadAviso, "firstName" | "lastName">) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "Sin nombre";
}

function nombreDelAsesor(lead: Pick<LeadAviso, "assignedTo">) {
  return lead.assignedTo?.name?.trim().split(/\s+/)[0] || "un asesor";
}

/** La nota puede ser larga; en el grupo basta el comienzo. */
function notaCorta(nota: string | null): string | null {
  const limpia = nota?.trim();
  if (!limpia) return null;
  return limpia.length > 300 ? `${limpia.slice(0, 297)}...` : limpia;
}

function horaChile(fecha: Date) {
  const partes = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(fecha);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value || "";
  return `${p("day")}-${p("month")}-${p("year")} ${p("hour")}:${p("minute")}`;
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

/** Las lineas sin dato se omiten: nunca se publica un "Nota: —". */
export function textoLeadNuevo(lead: LeadAviso, tipo: TipoLead): string {
  const lineas = [
    tipo === "ANUNCIO" ? "📣 *Nuevo lead*" : "🌐 *Nuevo lead*",
    "",
    `👤 *${nombreDelLead(lead)}*`,
    `📍 *Viene de:* ${deDondeViene(lead)}`,
  ];

  const conocio = tipo === "WEB" ? comoNosConocio(lead.comoConocio) : null;
  if (conocio) lineas.push(`🗣️ *Nos conoció por:* ${conocio}`);

  const nota = notaCorta(lead.notes);
  if (nota) lineas.push(`📝 *Nota:* ${nota}`);

  lineas.push("", `👨‍💼 *Asignado a:* ${nombreDelAsesor(lead)}`, `🕐 ${horaChile(lead.createdAt)}`);

  return lineas.join("\n");
}

export function textoLeadSinAtender(lead: LeadAviso): string {
  return [
    "⏰ *Lead sin atender (30 min)*",
    `👤 ${nombreDelLead(lead)} · ${deDondeViene(lead)}`,
    `👨‍💼 ${nombreDelAsesor(lead)} aún no lo marca como contactado`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Registro y envio
// ---------------------------------------------------------------------------

type Evento = "LEAD_NUEVO" | "LEAD_SIN_ATENDER";

/**
 * Reclama un aviso antes de mandarlo. Devuelve el id del registro si esta
 * pasada se lo gano, o null si otra ya lo envio o lo esta enviando.
 *
 * Un aviso en ERROR se vuelve a reclamar mientras no pase el tope de intentos.
 * Uno que quedo en PENDIENTE (el proceso murio a mitad del envio) NO se
 * reintenta: no hay forma de saber si WhatsApp alcanzo a publicarlo, y un
 * aviso perdido es menos dañino que uno duplicado en el grupo.
 */
async function reclamarAviso(
  leadId: string, evento: Evento, tipo: TipoLead, texto: string, cfg: Config
): Promise<bigint | null> {
  const nuevo: { id: bigint }[] = await prisma.$queryRaw`
    INSERT INTO public.whatsapp_lead_avisos
      (lead_id, evento, tipo_lead, instancia, grupo_jid, texto, estado, intentos)
    VALUES (${leadId}, ${evento}, ${tipo}, ${cfg.instancia}, ${cfg.grupo}, ${texto}, 'PENDIENTE', 1)
    ON CONFLICT (lead_id, evento) DO NOTHING
    RETURNING id`;
  if (nuevo.length > 0) return nuevo[0].id;

  const reintento: { id: bigint }[] = await prisma.$queryRaw`
    UPDATE public.whatsapp_lead_avisos
       SET estado = 'PENDIENTE', intentos = intentos + 1, texto = ${texto}, error = NULL
     WHERE lead_id = ${leadId} AND evento = ${evento}
       AND estado = 'ERROR' AND intentos < ${MAX_INTENTOS}
    RETURNING id`;
  return reintento.length > 0 ? reintento[0].id : null;
}

async function enviarAlGrupo(texto: string, cfg: Config): Promise<string | null> {
  const respuesta = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
    body: JSON.stringify({ number: cfg.grupo, text: texto }),
    signal: AbortSignal.timeout(15000),
  });

  const cuerpo = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`Evolution respondio ${respuesta.status}: ${cuerpo.slice(0, 500)}`);
  }

  try {
    return JSON.parse(cuerpo)?.key?.id ?? null;
  } catch {
    return null;
  }
}

async function avisar(
  lead: LeadAviso, evento: Evento, tipo: TipoLead, texto: string, cfg: Config
): Promise<boolean> {
  const registroId = await reclamarAviso(lead.id, evento, tipo, texto, cfg);
  if (registroId === null) return false;

  try {
    const waId = await enviarAlGrupo(texto, cfg);
    await prisma.$executeRaw`
      UPDATE public.whatsapp_lead_avisos
         SET estado = 'ENVIADO', wa_message_id = ${waId}, enviado_en = now()
       WHERE id = ${registroId}`;
    return true;
  } catch (error: any) {
    console.error(`[avisos-whatsapp] Fallo ${evento} del lead ${lead.id}:`, error);
    await prisma.$executeRaw`
      UPDATE public.whatsapp_lead_avisos
         SET estado = 'ERROR', error = ${String(error?.message || error).slice(0, 1000)}
       WHERE id = ${registroId}`;
    return false;
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Corre una pasada. Pensada para llamarse cada minuto desde instrumentation.ts;
 * es correcta a cualquier frecuencia y segura de repetir.
 */
export async function runAvisosWhatsappLeads() {
  const cfg = leerConfig();
  if (!cfg) return { activo: false, enviados: 0 };

  const ahora = Date.now();
  const desde = new Date(Math.max(cfg.desde.getTime(), ahora - ANTIGUEDAD_MAXIMA_MS));
  let enviados = 0;
  let presupuesto = MAX_POR_CORRIDA;

  // 1) Leads nuevos ya asignados que todavia no tienen su aviso enviado.
  //
  // El filtro por fecha va por el ORM y no en SQL crudo a proposito:
  // Lead.createdAt es un timestamp sin zona, y comparado contra un parametro
  // crudo el resultado depende de la zona horaria de la sesion de la base. Con
  // el ORM, Prisma hace la conversion igual que en el resto del CRM.
  const recientes: { id: string }[] = await (prisma as any).lead.findMany({
    where: { createdAt: { gte: desde }, assignedToId: { in: ASESORES_ANUNCIABLES } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const yaResueltos: { lead_id: string }[] = recientes.length
    ? await prisma.$queryRaw`
        SELECT lead_id FROM public.whatsapp_lead_avisos
         WHERE evento = 'LEAD_NUEVO'
           AND lead_id = ANY(${recientes.map((l) => l.id)})
           AND (estado <> 'ERROR' OR intentos >= ${MAX_INTENTOS})`
    : [];
  const resueltos = new Set(yaResueltos.map((r) => r.lead_id));
  const candidatos = recientes.filter((l) => !resueltos.has(l.id)).slice(0, MAX_POR_CORRIDA);

  for (const { id } of candidatos) {
    if (presupuesto <= 0) break;
    const lead: LeadAviso | null = await (prisma as any).lead.findUnique({ where: { id }, select: SELECT_LEAD });
    if (!lead) continue;

    const tipo = tipoDeLead(lead);
    if (!tipo) {
      // Se deja constancia para no volver a evaluarlo en cada pasada.
      await prisma.$executeRaw`
        INSERT INTO public.whatsapp_lead_avisos
          (lead_id, evento, tipo_lead, instancia, grupo_jid, texto, estado, error, intentos)
        VALUES (${id}, 'LEAD_NUEVO', NULL, ${cfg.instancia}, ${cfg.grupo}, '', 'ERROR',
                ${`No se anuncia: origen "${lead.source}"`}, ${MAX_INTENTOS})
        ON CONFLICT (lead_id, evento) DO NOTHING`;
      continue;
    }

    if (presupuesto < MAX_POR_CORRIDA) await pausa(PAUSA_ENTRE_ENVIOS_MS);
    presupuesto--;
    if (await avisar(lead, "LEAD_NUEVO", tipo, textoLeadNuevo(lead, tipo), cfg)) enviados++;
  }

  // 2) Leads anunciados hace mas de 30 minutos que el asesor no ha contactado.
  //    Se cuenta desde el aviso y no desde la creacion: un lead que entro de
  //    noche y se asigno en la mañana tiene sus 30 minutos desde que se supo.
  //    Los plazos se calculan con now() de la propia base, contra enviado_en,
  //    que es timestamptz y tambien lo escribe now(): no depende de zonas.
  const minutosSinAtender = SIN_ATENDER_TRAS_MS / 60000;

  const sinAtender: { id: string; tipo_lead: TipoLead }[] = await prisma.$queryRaw`
    SELECT l.id, a.tipo_lead
      FROM public.whatsapp_lead_avisos a
      JOIN "Lead" l ON l.id = a.lead_id
     WHERE a.evento = 'LEAD_NUEVO' AND a.estado = 'ENVIADO'
       AND a.enviado_en <= now() - make_interval(mins => ${minutosSinAtender}::int)
       AND a.enviado_en >= now() - interval '24 hours'
       AND COALESCE(l.contacted, false) = false
       AND l."assignedToId" = ANY(${ASESORES_ANUNCIABLES})
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_lead_avisos s
          WHERE s.lead_id = l.id AND s.evento = 'LEAD_SIN_ATENDER'
            AND (s.estado <> 'ERROR' OR s.intentos >= ${MAX_INTENTOS})
       )
     ORDER BY a.enviado_en ASC
     LIMIT ${MAX_POR_CORRIDA}`;

  for (const fila of sinAtender) {
    if (presupuesto <= 0) break;
    const lead: LeadAviso | null = await (prisma as any).lead.findUnique({ where: { id: fila.id }, select: SELECT_LEAD });
    if (!lead) continue;

    if (presupuesto < MAX_POR_CORRIDA) await pausa(PAUSA_ENTRE_ENVIOS_MS);
    presupuesto--;
    if (await avisar(lead, "LEAD_SIN_ATENDER", fila.tipo_lead, textoLeadSinAtender(lead), cfg)) enviados++;
  }

  return { activo: true, enviados };
}
