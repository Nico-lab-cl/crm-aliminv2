import prisma from "./prisma";
import { BARBARA_ID, MARCELA_ID, ORLANDO_ID, getNextAdvisorId } from "./assignment";
import { createNotification } from "./notifications";
import { ALI_SENDER, DUENO_MIENTRAS_ALI, FUENTES_IA, HANDOFF_SOURCE, avisarDerivacion } from "./ali";
import { enviarAlGrupo } from "./avisosWhatsappLeads";
import { memoriaDelLead } from "./memoriaLead";
import { agenteParaLead } from "./agenteIA";
import {
  AUTO_SOURCE,
  EVENTO_SOURCE,
  anotar,
  esCuentaDePrueba,
  graph,
  guardar,
  recordar,
  respuestaAutoActiva,
  responderAutomatico,
  responderEnPublico,
  unirConChat,
  type Entrada,
} from "./respuestaAutomatica";

/**
 * Ali conversando en Instagram y Facebook (decisión de Nicolás, 11-11-2026).
 *
 * El cerebro de Ali vive en el sitio (aliminspa.cl/api/ali/redes): ficha,
 * precios, herramientas y agenda. Acá vive lo que le toca al CRM: decidir si
 * Ali responde, armar la conversación, mandar lo que Ali escribe por la Graph
 * API, guardarlo, y crear o completar el lead con los datos que la persona da.
 *
 * Encendido con ALI_REDES_ACTIVA:
 *   - sin definir o "false": sigue la plantilla de respuestaAutomatica.ts.
 *   - "prueba": Ali solo con las cuentas de RESPUESTA_AUTO_PRUEBA; el resto, plantilla.
 *   - "true": Ali con todos.
 * RESPUESTA_AUTO_ACTIVA=false sigue apagando todo, plantilla y Ali.
 *
 * Cuándo responde Ali: el último mensaje es del cliente, dentro de las 24 h
 * que permite Meta, y no hay un asesor atendiendo. Si un asesor escribió en la
 * conversación, Ali solo retoma cuando el cliente lleva 2 h esperando sin
 * respuesta (retomarPendientes, cada 10 minutos).
 */

const ESPERA_RAFAGA_MS = 4000;
const PAUSA_ENTRE_BURBUJAS_MS = 1500;
const VENTANA_META_MS = 24 * 60 * 60 * 1000;
const ESPERA_ASESOR_MS = 2 * 60 * 60 * 1000;
const DIAS_ENTRE_COMENTARIOS = 7;
const TIMEOUT_SITIO_MS = 60_000;

// DUENO_MIENTRAS_ALI y FUENTES_IA viven en lib/ali.ts porque la bandeja del
// CRM también los usa (filtroBandeja); se reexportan para no romper imports.
export { DUENO_MIENTRAS_ALI };
/** Lead score (public.lead_score, lo calcula el CRM web) desde el que el lead pasa a un asesor. */
export const PUNTAJE_PARA_ASESOR = 28;

export type ModoAliRedes = "apagada" | "prueba" | "todos";

export function modoAliRedes(): ModoAliRedes {
  const v = (process.env.ALI_REDES_ACTIVA || "").trim().toLowerCase();
  if (v === "true" || v === "todos") return "todos";
  if (v === "prueba") return "prueba";
  return "apagada";
}

/** Un mensaje o comentario del cliente que llegó por el webhook de Meta. */
export interface AvisoMeta extends Entrada {
  /** Es el primer mensaje de una conversación nueva. */
  nueva: boolean;
  /** Tenía texto escrito (no solo un adjunto). La plantilla vieja solo responde texto. */
  conTexto: boolean;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RED: Record<"instagram" | "facebook", string> = { instagram: "Instagram", facebook: "Facebook" };

/* ── Entrada desde el webhook ─────────────────────────────────────────── */

/**
 * Decide quién responde un mensaje de IG/FB: Ali o la plantilla de siempre.
 * Nunca lanza: corre después de devolverle el 200 a Meta.
 */
export async function atenderMeta(a: AvisoMeta) {
  try {
    const modo = modoAliRedes();
    const usaAli =
      respuestaAutoActiva() &&
      Boolean(process.env.IA_SECRET) &&
      (modo === "todos" || (modo === "prueba" && (await esCuentaDePrueba(a.conversationId))));

    if (!usaAli) {
      // Lo de siempre: plantilla al comentario o al primer DM con texto.
      if (a.conTexto && (a.via === "comentario" || a.nueva)) await responderAutomatico(a);
      return;
    }

    // Comentario: el brochure con "pincha aquí" por privado y los precios reales
    // en público. Quien comenta no inició una conversación: por eso va el
    // enlace. Si después escribe, conversa con Ali (Nicolás, 12-11-2026).
    if (a.via === "comentario") {
      const publica = await preciosPublicos(`${a.publicacion || ""} ${a.texto}`);
      await responderAutomatico(a, { conAli: true, textoPublico: publica });
      return;
    }
    // Inbox: la persona vino a conversar. Ali saluda, pregunta el nombre y da
    // la información ella misma, sin enlaces.
    programar(a);
  } catch (error) {
    console.error("[ali-redes] Error atendiendo el aviso de Meta:", error);
  }
}

/* ── Primer contacto ──────────────────────────────────────────────────── */

/*
 * Comentarios delicados (reclamo, "estafa", insulto, postventa: categoría
 * "otro"): responderAutomatico no manda nada y deja una nota para una persona.
 * Nicolás pidió armar ese protocolo más adelante (11-11-2026); cuando exista,
 * se implementa ahí.
 */

/** Precios reales para la respuesta pública, desde el sitio (misma lista que las tarjetas). */
async function preciosPublicos(texto: string): Promise<string | null> {
  try {
    const base = (process.env.ALI_SITIO_URL || "https://aliminspa.cl").replace(/\/+$/, "");
    const res = await fetch(`${base}/api/ali/precios?texto=${encodeURIComponent(texto.slice(0, 1500))}`, {
      headers: { "x-ia-secret": process.env.IA_SECRET as string },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`el sitio respondió ${res.status}`);
    const d = (await res.json()) as { publica?: string };
    return typeof d.publica === "string" && d.publica.trim() ? d.publica.trim().slice(0, 1500) : null;
  } catch (error) {
    // Sin precios sale la frase de siempre ("te escribimos por interno").
    console.error("[ali-redes] No se pudieron traer los precios para la respuesta pública:", error);
    return null;
  }
}

/* ── Turnos por conversación ──────────────────────────────────────────── */

interface Turno {
  temporizador: ReturnType<typeof setTimeout> | null;
  corriendo: boolean;
  pendiente: boolean;
  aviso: AvisoMeta;
}

const turnos = new Map<string, Turno>();

/** Espera unos segundos por si la persona manda varios mensajes seguidos. */
function programar(a: AvisoMeta) {
  let t = turnos.get(a.conversationId);
  if (!t) {
    t = { temporizador: null, corriendo: false, pendiente: false, aviso: a };
    turnos.set(a.conversationId, t);
  } else if (a.via === "comentario" || t.aviso.via !== "comentario") {
    // Un comentario manda: su primera respuesta tiene que ir como mensaje privado al comentario.
    t.aviso = a;
  }
  if (t.corriendo) {
    t.pendiente = true;
    return;
  }
  if (t.temporizador) clearTimeout(t.temporizador);
  const turno = t;
  turno.temporizador = setTimeout(() => correr(turno), ESPERA_RAFAGA_MS);
}

async function correr(t: Turno) {
  t.temporizador = null;
  t.corriendo = true;
  t.pendiente = false;
  try {
    await responder(t.aviso);
  } catch (error) {
    console.error(`[ali-redes] Error respondiendo ${t.aviso.conversationId}:`, error);
  } finally {
    t.corriendo = false;
    if (t.pendiente) {
      t.pendiente = false;
      // Lo que llegó mientras respondía ya es conversación por DM.
      t.aviso = { ...t.aviso, via: "dm", commentId: undefined };
      t.temporizador = setTimeout(() => correr(t), ESPERA_RAFAGA_MS);
    } else {
      turnos.delete(t.aviso.conversationId);
    }
  }
}

/* ── Respuesta ────────────────────────────────────────────────────────── */

interface RespuestaSitio {
  burbujas: string[];
  contacto: { nombre: string | null; telefono: string | null; email: string | null; interes: string | null } | null;
  derivacion: { motivo: string; resumen: string } | null;
  visita: { proyecto: string; fecha: string; hora: string } | null;
  /** Texto para responder en público bajo el comentario, con los precios reales. */
  publica: string | null;
}

type MensajeBase = { text: string; senderType: string; sourceType: string; mediaUrl: string | null; createdAt: Date };

async function responder(a: AvisoMeta) {
  const conv = await prisma.conversation.findUnique({
    where: { id: a.conversationId },
    include: { lead: { include: { assignedTo: { select: { name: true } } } } },
  });
  if (!conv || (conv.platform !== "instagram" && conv.platform !== "facebook")) return;
  const plataforma = conv.platform as "instagram" | "facebook";

  const recientes: MensajeBase[] = (
    await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { text: true, senderType: true, sourceType: true, mediaUrl: true, createdAt: true },
    })
  ).reverse();
  const conversacion = recientes.filter((m) => m.sourceType !== EVENTO_SOURCE);
  const ultimo = conversacion[conversacion.length - 1];
  if (!ultimo || ultimo.senderType !== "meta") return;

  const ahora = Date.now();
  if (ahora - ultimo.createdAt.getTime() > VENTANA_META_MS) return;

  // Asesor atendiendo: lo último que salió de nuestro lado es de un asesor y
  // lo escribió hace menos de 2 h. Ahí Ali espera (retoma si el cliente pasa
  // 2 h sin respuesta). Un mensaje de asesor más viejo, o uno al que Ali ya le
  // siguió, no la calla: Ali atiende sola (Nicolás, 12-11-2026).
  const ultimoNuestro = [...conversacion].reverse().find((m) => m.senderType === "advisor" || m.senderType === ALI_SENDER);
  const asesorActivo =
    ultimoNuestro?.senderType === "advisor" && ahora - ultimoNuestro.createdAt.getTime() < ESPERA_ASESOR_MS;
  if (asesorActivo && ahora - ultimo.createdAt.getTime() < ESPERA_ASESOR_MS) {
    console.log(`[ali-redes] ${conv.id}: lo atiende un asesor; Ali retoma solo si pasan 2 h sin respuesta.`);
    return;
  }

  // Un comentario se responde con mensaje privado una vez por persona cada 7
  // días (como la plantilla). Si ya conversan, el comentario no abre otro chat.
  let viaComentario = a.via === "comentario" && Boolean(a.commentId);
  if (viaComentario && !(await esCuentaDePrueba(conv.id))) {
    const desde = ahora - DIAS_ENTRE_COMENTARIOS * 24 * 60 * 60 * 1000;
    const yaHablaron = conversacion.some(
      (m) => (m.senderType === ALI_SENDER || m.senderType === "advisor") && m.createdAt.getTime() >= desde
    );
    if (yaHablaron) {
      console.log(`[ali-redes] ${conv.id}: comentario de alguien con quien ya se habló esta semana, no respondo.`);
      return;
    }
  }
  if (!viaComentario && ultimo.sourceType === "COMMENT") {
    // Sin el id del comentario no se le puede escribir por privado (retomar).
    return;
  }

  type MensajeIA = { de: "cliente" | "ali" | "asesor"; texto: string; imagenUrl?: string | null };
  // Solo la conversación actual: desde el último silencio de más de 24 h. Lo
  // anterior (un comentario de hace días ya respondido con el brochure) hacía
  // que Ali contestara preguntas viejas (prueba del 12-11-2026).
  let inicioSesion = 0;
  for (let i = conversacion.length - 1; i > 0; i--) {
    if (conversacion[i].createdAt.getTime() - conversacion[i - 1].createdAt.getTime() > VENTANA_META_MS) {
      inicioSesion = i;
      break;
    }
  }
  const mensajes: MensajeIA[] = conversacion.slice(inicioSesion).slice(-40).flatMap((m): MensajeIA[] => {
    if (m.senderType === "meta") {
      const esImagen = /^\[imagen\]$/i.test(m.text);
      const texto = m.sourceType === "COMMENT" ? `(Comentó en la publicación) ${m.text}` : m.text;
      return [{ de: "cliente", texto, imagenUrl: esImagen && m.mediaUrl ? m.mediaUrl : null }];
    }
    if (m.senderType === ALI_SENDER) {
      if (m.text.startsWith("(Respuesta pública")) return [];
      const texto = m.text.replace(/^\[Portada del brochure\]\s*/, "");
      // El brochure del primer contacto va marcado: Ali no lo cuenta como que ya se presentó.
      return [{ de: "ali", texto: m.sourceType === AUTO_SOURCE ? `[Mensaje automático con el brochure] ${texto}` : texto }];
    }
    if (m.senderType === "advisor") return [{ de: "asesor", texto: m.text }];
    return [];
  });

  const lead = conv.lead;
  const nombreLead = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || null;
  const publicacion = a.publicacion || null;
  // Lo anterior al corte no se pierde: va como memoria (ficha del lead, sus
  // movimientos y lo que habló antes aquí y en otros canales).
  const memoria = await memoriaDelLead(conv.id, conversacion.slice(0, inicioSesion)).catch((error) => {
    console.error(`[ali-redes] No se pudo armar la memoria de ${conv.id}:`, error);
    return null;
  });
  // Ali o Cierre según la etapa del lead (agenteIA.ts).
  const agente = await agenteParaLead(conv.leadId);

  const inicio = new Date();
  let r: RespuestaSitio;
  try {
    r = await pedirAlSitio({
      canal: plataforma,
      conversacionId: conv.id,
      via: viaComentario ? "comentario" : "dm",
      publicacion,
      cliente: { nombre: nombreLead, telefono: lead?.phone || null, email: lead?.email || null },
      mensajes,
      memoria,
      agente,
    });
  } catch (error) {
    console.error(`[ali-redes] El sitio no respondió para ${conv.id}:`, error);
    await anotarUnaVez(conv.id, "Ali no pudo responder este mensaje (falla técnica). Lo tiene que atender un asesor.");
    return;
  }

  // Los datos se guardan aunque después falle el envío.
  await procesarContacto(conv.id, plataforma, r.contacto, mensajes.filter((m) => m.de === "cliente").map((m) => m.texto));

  if (!r.burbujas.length) return;
  if (await asesorEscribioDesde(conv.id, inicio)) return;

  let conversationId = conv.id;
  const fuente = (i: number, total: number) => (r.derivacion && i === total - 1 ? HANDOFF_SOURCE : "DIRECT");

  if (viaComentario && a.commentId) {
    // Meta permite un solo mensaje privado por comentario hasta que la persona
    // conteste: las burbujas van juntas en uno.
    const texto = r.burbujas.join("\n\n");
    const privado = await graph("/me/messages", { recipient: { comment_id: a.commentId }, message: { text: texto } });
    recordar(privado.message_id);
    conversationId = await unirConChat(conv.id, privado.recipient_id);
    await guardar(conversationId, texto, privado.message_id, fuente(0, 1));
    // En público, los precios tal cual (decisión de Nicolás, 11-11-2026).
    await responderEnPublico(a.commentId, plataforma, conversationId, r.publica || undefined);
  } else {
    for (let i = 0; i < r.burbujas.length; i++) {
      if (i > 0) {
        await dormir(PAUSA_ENTRE_BURBUJAS_MS);
        if (await asesorEscribioDesde(conv.id, inicio)) return;
      }
      const msg = await graph("/me/messages", {
        recipient: { id: conv.psid },
        messaging_type: "RESPONSE",
        message: { text: r.burbujas[i].slice(0, 1900) },
      });
      recordar(msg.message_id);
      await guardar(conversationId, r.burbujas[i], msg.message_id, fuente(i, r.burbujas.length));
    }
  }

  const leadId =
    (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { leadId: true } }))?.leadId || null;
  if (r.visita) {
    await anotar(conversationId, `📅 Ali agendó una visita a ${r.visita.proyecto} el ${r.visita.fecha} a las ${r.visita.hora}.`);
    // La visita la guía un asesor: pasa de inmediato.
    if (leadId) await pasarAlAsesor(leadId, `agendó una visita a ${r.visita.proyecto} el ${r.visita.fecha} a las ${r.visita.hora}`);
  }
  if (r.derivacion) {
    const pasado = leadId ? await pasarAlAsesor(leadId, `pidió un asesor: ${r.derivacion.motivo}`, r.derivacion.resumen) : false;
    // Sin lead de Ali (todavía no da sus datos, o ya era de un asesor): aviso de siempre.
    if (!pasado) await derivar(conversationId, plataforma, r.derivacion);
  }
}

async function pedirAlSitio(cuerpo: unknown): Promise<RespuestaSitio> {
  const base = (process.env.ALI_SITIO_URL || "https://aliminspa.cl").replace(/\/+$/, "");
  const res = await fetch(`${base}/api/ali/redes`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ia-secret": process.env.IA_SECRET as string },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TIMEOUT_SITIO_MS),
  });
  if (!res.ok) throw new Error(`El sitio respondió ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const d = (await res.json()) as Partial<RespuestaSitio>;
  return {
    burbujas: Array.isArray(d.burbujas) ? d.burbujas.filter((b) => typeof b === "string" && b.trim()) : [],
    contacto: d.contacto ?? null,
    derivacion: d.derivacion ?? null,
    visita: d.visita ?? null,
    publica: typeof d.publica === "string" && d.publica.trim() ? d.publica.trim().slice(0, 1500) : null,
  };
}

async function asesorEscribioDesde(conversationId: string, desde: Date) {
  const m = await prisma.message.findFirst({
    where: { conversationId, senderType: "advisor", createdAt: { gt: desde } },
    select: { id: true },
  });
  return Boolean(m);
}

/** Nota interna que no se repite en la misma hora. */
async function anotarUnaVez(conversationId: string, texto: string) {
  const reciente = await prisma.message.findFirst({
    where: { conversationId, sourceType: EVENTO_SOURCE, text: texto, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    select: { id: true },
  });
  if (!reciente) await anotar(conversationId, texto);
}

async function derivar(conversationId: string, plataforma: "instagram" | "facebook", d: { motivo: string; resumen: string }) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: { include: { assignedTo: { select: { name: true } } } } },
  });
  if (!conv) return;
  const lead = conv.lead;
  const nombre = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || conv.metaName || "Un cliente";
  if (conv.leadId) {
    await prisma.lead.update({
      where: { id: conv.leadId },
      data: { lastActivity: `Ali pidió un asesor: ${d.motivo}`.slice(0, 190), lastNoteAt: new Date() },
    });
  }
  await avisarDerivacion({
    leadId: conv.leadId,
    nombre,
    motivo: String(d.motivo || "Pide hablar con un asesor").slice(0, 300),
    resumen: String(d.resumen || "").slice(0, 600),
    asignadoId: lead?.assignedToId || null,
    asignadoNombre: lead?.assignedTo?.name || null,
    canal: RED[plataforma],
  });
}

/* ── Contacto → lead ──────────────────────────────────────────────────── */

const CORREO = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
const CELULAR = /(?:\+?\s*56[\s.-]*)?9[\s.-]*\d{4}[\s.-]*\d{4}/;

/** Celular chileno a +569XXXXXXXX; otros números se dejan con su + si tienen 8 a 15 dígitos. */
export function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digitos)) return `+56${digitos}`;
  if (/^569\d{8}$/.test(digitos)) return `+${digitos}`;
  if (valor.trim().startsWith("+") && digitos.length >= 8 && digitos.length <= 15) return `+${digitos}`;
  return null;
}

function normalizarCorreo(valor: string | null | undefined) {
  const v = (valor || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v) && v.length <= 120 ? v : null;
}

/** Respaldo sin IA: teléfono o correo escritos por el cliente que Ali no guardó. */
export function detectarContacto(textos: string[]) {
  let telefono: string | null = null;
  let email: string | null = null;
  for (const t of [...textos].reverse()) {
    if (!email) email = normalizarCorreo(t.match(CORREO)?.[0]);
    if (!telefono) {
      const m = t.match(CELULAR)?.[0];
      telefono = m ? normalizarTelefono(m) : null;
    }
  }
  return { telefono, email };
}

async function buscarPorTelefono(telefono: string) {
  const ultimos = telefono.replace(/\D/g, "").slice(-8);
  if (ultimos.length < 8) return null;
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lead"
     WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 8) = ${ultimos}
     ORDER BY "createdAt" DESC LIMIT 1`;
  return filas[0] ? prisma.lead.findUnique({ where: { id: filas[0].id } }) : null;
}

/**
 * Con el contacto que dio la persona: si ya es lead, se vincula y se completa
 * lo que falte (sigue con su asesor); si no, se crea el lead, entra a la rueda
 * y le llega el push al asesor. El aviso al grupo de WhatsApp sale solo por
 * avisosWhatsappLeads.ts, como con cualquier lead de anuncio.
 */
async function procesarContacto(
  conversationId: string,
  plataforma: "instagram" | "facebook",
  deAli: RespuestaSitio["contacto"],
  textosCliente: string[]
) {
  try {
    const detectado = detectarContacto(textosCliente);
    const telefono = (deAli?.telefono && normalizarTelefono(deAli.telefono)) || detectado.telefono;
    const email = normalizarCorreo(deAli?.email) || detectado.email;
    const nombre = (deAli?.nombre || "").trim().slice(0, 80) || null;
    const interes = (deAli?.interes || "").trim().slice(0, 300) || null;

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return;
    const red = RED[plataforma];

    let lead = conv.leadId ? await prisma.lead.findUnique({ where: { id: conv.leadId } }) : null;
    if (!lead && email) lead = await prisma.lead.findUnique({ where: { email } });
    if (!lead && telefono) lead = await buscarPorTelefono(telefono);

    const [nombrePila, ...resto] = (nombre || "").split(/\s+/).filter(Boolean);

    if (lead) {
      const datos: Record<string, string> = {};
      if (!lead.firstName && nombrePila) datos.firstName = nombrePila;
      if (!lead.lastName && resto.length) datos.lastName = resto.join(" ");
      if (!lead.phone && telefono) datos.phone = telefono;
      if (!lead.email && email && !(await prisma.lead.findUnique({ where: { email }, select: { id: true } }))) datos.email = email;
      const nuevos = Object.keys(datos);
      const vincular = conv.leadId !== lead.id;
      if (!nuevos.length && !vincular) return;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { ...datos, lastActivity: `Escribió por ${red} (atendido por Ali)`.slice(0, 190) },
      });
      if (vincular) {
        await prisma.conversation.update({ where: { id: conv.id }, data: { leadId: lead.id } });
        await anotar(conv.id, `🔗 Esta conversación quedó vinculada con un lead que ya estaba en el CRM.`);
      }
      if (nuevos.length) {
        const nombres: Record<string, string> = { firstName: "nombre", lastName: "apellido", phone: "teléfono", email: "correo" };
        await anotar(conv.id, `✍️ Ali completó en la ficha: ${nuevos.map((k) => nombres[k]).join(", ")}.`);
      }
      return;
    }

    // Sin teléfono ni correo todavía no hay lead que crear.
    if (!telefono && !email) return;

    // Mientras lo atiende Ali, el lead es de Nicolás y no avisa a nadie
    // (12-11-2026). Pasa a la rueda con pasarAlAsesor(): 28 puntos de lead
    // score, visita agendada o derivación. followupStage 3 lo deja fuera de la
    // escalera de recordatorios de followups.ts.
    const source = `${red} - IA`;
    let creado;
    try {
      creado = await prisma.lead.create({
        data: {
          firstName: nombrePila || null,
          lastName: resto.join(" ") || null,
          phone: telefono,
          email,
          source,
          status: "NUEVO",
          preferredChannel: red,
          notes: interes ? `Ali (${red}): ${interes}` : null,
          lastActivity: `Lead creado por Ali en ${red}`,
          assignedToId: DUENO_MIENTRAS_ALI,
          followupStage: 3,
        },
      });
    } catch (error: any) {
      // Otro proceso creó el lead con ese correo en paralelo: se vincula ese.
      if (error?.code === "P2002" && email) {
        const otro = await prisma.lead.findUnique({ where: { email } });
        if (otro) await prisma.conversation.update({ where: { id: conv.id }, data: { leadId: otro.id } });
        return;
      }
      throw error;
    }
    await prisma.conversation.update({ where: { id: conv.id }, data: { leadId: creado.id } });
    await anotar(
      conv.id,
      `🆕 Ali creó el lead con los datos que dio el cliente. Queda a cargo de Nicolás mientras lo atiende Ali; pasa a un asesor al llegar a ${PUNTAJE_PARA_ASESOR} puntos, si agenda una visita o si pide una persona.`
    );
    // Sin aviso a ningún grupo al crearlo (Nicolás, 12-11-2026): el grupo de
    // leads solo se entera cuando el lead pasa a un asesor (pasarAlAsesor).
  } catch (error) {
    console.error(`[ali-redes] No se pudo guardar el contacto de ${conversationId}:`, error);
  }
}

/* ── Paso del lead de Ali a un asesor ─────────────────────────────────── */

/**
 * Pasa un lead que atiende Ali (de Nicolás, origen "… - IA") a un asesor de
 * la rueda, con push y aviso al grupo. Devuelve false si el lead no es de Ali
 * o si otro proceso ya lo pasó. El cambio de dueño es atómico (updateMany
 * condicionado), así que nunca se asigna dos veces.
 */
export async function pasarAlAsesor(leadId: string, motivo: string, resumen?: string | null): Promise<boolean> {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.assignedToId !== DUENO_MIENTRAS_ALI || !FUENTES_IA.includes(lead.source || "")) return false;

    const asesorId = await getNextAdvisorId([MARCELA_ID, ORLANDO_ID, BARBARA_ID], lead.source);
    if (!asesorId) return false;
    const r = await prisma.lead.updateMany({
      where: { id: leadId, assignedToId: DUENO_MIENTRAS_ALI },
      data: { assignedToId: asesorId, lastActivity: `Ali lo pasó a un asesor: ${motivo}`.slice(0, 190), lastNoteAt: new Date() },
    });
    if (!r.count) return false;

    const asesor = await prisma.user.findUnique({ where: { id: asesorId }, select: { name: true } });
    const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Cliente";
    const red = (lead.source || "").replace(/ - IA$/, "");
    const interes = (lead.notes || "").replace(/^Ali \([^)]*\):\s*/, "").slice(0, 200);

    const conversaciones = await prisma.conversation.findMany({ where: { leadId }, select: { id: true } });
    for (const c of conversaciones) {
      await anotar(c.id, `➡️ Ali pasó el lead a ${asesor?.name || "un asesor"}: ${motivo}.`).catch(() => {});
    }

    await createNotification({
      userId: asesorId,
      title: `🤖 Ali te pasa un lead de ${red}`,
      body: `${nombre} · ${motivo}${interes ? ` · ${interes}` : ""}`.slice(0, 180),
      leadId,
      type: "NEW_LEAD",
    }).catch((e) => console.error("[ali-redes] No salió el push del paso al asesor:", e));

    // En el grupo están todos los asesores: nunca teléfono ni correo.
    await avisarAlGrupo(
      [
        `🤖➡️👤 *Ali pasa un lead · ${red}*`,
        "",
        `*Cliente:* ${nombre}`,
        `*Por qué:* ${motivo}`,
        resumen ? `*Lo que conversó con Ali:* ${resumen.slice(0, 400)}` : interes ? `*Busca:* ${interes}` : null,
        `*Asignado a:* ${asesor?.name || "asesor de la rueda"}`,
      ]
        .filter((l) => l !== null)
        .join("\n")
    );
    console.log(`[ali-redes] Lead ${leadId} pasó a ${asesor?.name || asesorId}: ${motivo}`);
    return true;
  } catch (error) {
    console.error(`[ali-redes] No se pudo pasar el lead ${leadId} al asesor:`, error);
    return false;
  }
}

/** Aviso al grupo de leads de los asesores. */
export async function avisarAlGrupo(texto: string) {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const grupo = process.env.LEADS_WHATSAPP_GROUP;
  if (!url || !apiKey || !grupo) return;
  await enviarAlGrupo(texto, { url, apiKey, instancia: process.env.EVOLUTION_INSTANCE || "nico", grupo, desde: new Date() }).catch(
    (e) => console.error("[ali-redes] No salió el aviso al grupo:", e)
  );
}

/**
 * Leads de Ali que ya juntaron el puntaje (o tienen visita agendada por otra
 * vía, por ejemplo desde el enlace de la agenda): pasan a un asesor.
 * Corre cada 10 minutos desde instrumentation.ts.
 */
export async function revisarPasesAlAsesor() {
  const filas = await prisma.$queryRaw<{ id: string; score: number | null; visita: boolean }[]>`
    SELECT l.id, s.score, (l."bookingId" IS NOT NULL) AS visita
      FROM "Lead" l
      LEFT JOIN public.lead_score s ON s.lead_id = l.id
     WHERE l."assignedToId" = ${DUENO_MIENTRAS_ALI}
       AND l.source IN (${FUENTES_IA[0]}, ${FUENTES_IA[1]})
       AND (s.score >= ${PUNTAJE_PARA_ASESOR} OR l."bookingId" IS NOT NULL)
     LIMIT 20`;
  let n = 0;
  for (const f of filas) {
    const motivo = f.visita ? "tiene una visita agendada" : `llegó a ${f.score} puntos de lead score`;
    if (await pasarAlAsesor(f.id, motivo)) n++;
  }
  return n;
}

/* ── Retomar cuando el asesor no responde ─────────────────────────────── */

/**
 * Conversaciones de IG/FB donde un asesor ya escribió, el cliente volvió a
 * escribir y lleva más de 2 h (y menos de 24 h) sin respuesta: Ali retoma.
 */
export async function retomarPendientes() {
  const modo = modoAliRedes();
  if (modo === "apagada" || !respuestaAutoActiva() || !process.env.IA_SECRET) return 0;

  const filas = await prisma.$queryRaw<{ id: string; platform: string }[]>`
    SELECT c.id, c.platform
      FROM "Conversation" c
      JOIN LATERAL (
        SELECT "createdAt" AS fecha FROM "Message"
         WHERE "conversationId" = c.id AND "senderType" = 'meta' AND "sourceType" = 'DIRECT'
         ORDER BY "createdAt" DESC LIMIT 1
      ) cl ON true
     WHERE c.platform IN ('instagram', 'facebook')
       AND (cl.fecha AT TIME ZONE 'UTC') < now() - interval '2 hours'
       AND (cl.fecha AT TIME ZONE 'UTC') > now() - interval '23 hours'
       AND EXISTS (SELECT 1 FROM "Message" a WHERE a."conversationId" = c.id AND a."senderType" = 'advisor')
       AND NOT EXISTS (
         SELECT 1 FROM "Message" r
          WHERE r."conversationId" = c.id AND r."senderType" IN ('advisor', 'ali')
            AND r."sourceType" <> ${EVENTO_SOURCE} AND r."createdAt" > cl.fecha
       )
     LIMIT 20`;

  let n = 0;
  for (const f of filas) {
    if (turnos.has(f.id)) continue;
    if (modo === "prueba" && !(await esCuentaDePrueba(f.id))) continue;
    n++;
    programar({
      conversationId: f.id,
      plataforma: f.platform as "instagram" | "facebook",
      via: "dm",
      texto: "",
      nueva: false,
      conTexto: false,
    });
  }
  return n;
}
