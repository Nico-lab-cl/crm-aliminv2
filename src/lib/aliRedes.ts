import prisma from "./prisma";
import { BARBARA_ID, MARCELA_ID, ORLANDO_ID, getNextAdvisorId } from "./assignment";
import { createNotification } from "./notifications";
import { ALI_SENDER, DUENO_MIENTRAS_ALI, FUENTES_IA, HANDOFF_SOURCE, NOTA_PERSONA, avisarDerivacion, esFallaDeAli, pedirUnaPersona } from "./ali";
import { ASESORES_ANUNCIABLES, enviarAlGrupo } from "./avisosWhatsappLeads";
import { memoriaDelLead } from "./memoriaLead";
import { agenteParaLead } from "./agenteIA";
import { oficinaDice } from "./oficina";
import { aliWhatsappActiva, enviarArchivoWhatsapp, enviarTextoWhatsapp, marcarLeidoWhatsapp, numeroDePsid, waIdDePsid } from "./whatsapp";
import { aliPausada, asegurarTablaPausas, pausarSiCorresponde, usaPausaHastaReactivar } from "./pausaAli";
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
/**
 * Reintentos (revisión Elephant Goldfish, 15-11-2026): si Ali no logra
 * responder un mensaje (el sitio falla, se reinicia el CRM, error de Meta o
 * respuesta vacía), queda una nota de falla y recuperarSinRespuesta lo vuelve
 * a intentar. Después de MAX_INTENTOS se le pasa a una persona con aviso.
 */
const MAX_INTENTOS = 2;
const FALLA = "Ali no pudo responder este mensaje";

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

/** Canales donde conversa Ali fuera del sitio. WhatsApp desde el 15-11-2026 (lib/whatsapp.ts). */
export type Plataforma = "instagram" | "facebook" | "whatsapp";

/** Un mensaje o comentario del cliente que llegó por el webhook de Meta. */
export interface AvisoMeta extends Omit<Entrada, "plataforma"> {
  plataforma: Plataforma;
  /** Es el primer mensaje de una conversación nueva. */
  nueva: boolean;
  /** Tenía texto escrito (no solo un adjunto). La plantilla vieja solo responde texto. */
  conTexto: boolean;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RED: Record<Plataforma, string> = { instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp" };

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
      if (a.conTexto && (a.via === "comentario" || a.nueva)) await responderAutomatico(a as Entrada);
      return;
    }

    // Comentario: el brochure con "pincha aquí" por privado y los precios reales
    // en público. Quien comenta no inició una conversación: por eso va el
    // enlace. Si después escribe, conversa con Ali (Nicolás, 12-11-2026).
    if (a.via === "comentario") {
      const publica = await preciosPublicos(`${a.publicacion || ""} ${a.texto}`);
      await responderAutomatico(a as Entrada, { conAli: true, textoPublico: publica });
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
    await anotarFalla(t.aviso.conversationId, "error al enviar o al preparar la respuesta").catch(() => {});
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
  /** Ali no respondió a propósito: la persona solo volvió a agradecer o reaccionar (Marcela, 20-11-2026). */
  silencio?: boolean;
  contacto: { nombre: string | null; telefono: string | null; email: string | null; interes: string | null } | null;
  derivacion: { motivo: string; resumen: string } | null;
  /** resumen: lo que Ali le deja al asesor que acompaña la visita (sin teléfono ni correo). */
  visita: { proyecto: string; fecha: string; hora: string; resumen?: string | null } | null;
  /** Texto para responder en público bajo el comentario (sin precios). */
  publica: string | null;
  /** Planos, brochures y ebooks que Ali eligió mandar después de sus mensajes. */
  documentos: DocumentoAli[];
}

type DocumentoAli = { nombre: string; tipo: "pdf" | "imagen"; url: string };

/** Solo archivos del propio sitio (/documentos/…): el CRM nunca manda una URL de afuera. */
function documentosValidos(lista: unknown, base: string): DocumentoAli[] {
  if (!Array.isArray(lista)) return [];
  const sitios = [base, "https://aliminspa.cl"].map((s) => `${s.replace(/\/+$/, "")}/documentos/`);
  return lista
    .filter(
      (d): d is DocumentoAli =>
        Boolean(d) &&
        typeof d.nombre === "string" &&
        (d.tipo === "pdf" || d.tipo === "imagen") &&
        typeof d.url === "string" &&
        sitios.some((s) => d.url.startsWith(s))
    )
    .slice(0, 3)
    .map((d) => ({ nombre: d.nombre.slice(0, 80), tipo: d.tipo, url: d.url }));
}

/**
 * Manda los documentos uno por uno después de los mensajes y los guarda como
 * "📎 <nombre>" (las imágenes con su URL, para verlas en la bandeja). Un
 * archivo que falla no corta los demás ni la respuesta.
 */
async function enviarDocumentos(
  conversationId: string,
  documentos: DocumentoAli[],
  enviar: (d: DocumentoAli) => Promise<string | null>
) {
  for (const d of documentos) {
    try {
      await dormir(PAUSA_ENTRE_BURBUJAS_MS);
      const id = await enviar(d);
      await (prisma as any).message.create({
        data: {
          conversationId,
          text: `📎 ${d.nombre}${d.tipo === "pdf" ? " (PDF)" : ""}`,
          senderType: ALI_SENDER,
          sourceType: "DIRECT",
          sourceId: id || null,
          mediaUrl: d.tipo === "imagen" ? d.url : null,
        },
      });
    } catch (error) {
      console.error(`[ali-redes] No se pudo mandar ${d.nombre}:`, error);
      await anotarFalla(conversationId, `no se pudo mandar ${d.nombre}`);
    }
  }
}

type MensajeBase = { text: string; senderType: string; sourceType: string; mediaUrl: string | null; createdAt: Date };

async function responder(a: AvisoMeta) {
  const conv = await prisma.conversation.findUnique({
    where: { id: a.conversationId },
    include: { lead: { include: { assignedTo: { select: { name: true } } } } },
  });
  if (!conv || !(["instagram", "facebook", "whatsapp"] as string[]).includes(conv.platform)) return;
  const plataforma = conv.platform as Plataforma;

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

  // Pausada (lib/pausaAli.ts): no responde hasta que alguien la reactive desde
  // el CRM web. Se le avisa a la persona que atiende, como cuando hay asesor.
  if (await aliPausada(conv.id)) {
    console.log(`[ali-redes] ${conv.id}: Ali está en pausa en este chat; no responde.`);
    await avisarMensajeAlAsesor(conv, plataforma, ultimo);
    return;
  }
  // En los chats con "pausa hasta reactivar" la pausa reemplaza la regla de
  // las 2 h: escribir una persona o derivar ya pausan a Ali, así que si llegó
  // hasta acá es porque alguien la reactivó y le toca responder.
  const conPausa = usaPausaHastaReactivar(conv);

  // Asesor atendiendo: lo último que salió de nuestro lado es de un asesor y
  // lo escribió hace menos de 2 h. Ahí Ali espera (retoma si el cliente pasa
  // 2 h sin respuesta). Un mensaje de asesor más viejo, o uno al que Ali ya le
  // siguió, no la calla: Ali atiende sola (Nicolás, 12-11-2026).
  const ultimoNuestro = [...conversacion].reverse().find((m) => m.senderType === "advisor" || m.senderType === ALI_SENDER);
  const asesorActivo =
    ultimoNuestro?.senderType === "advisor" && ahora - ultimoNuestro.createdAt.getTime() < ESPERA_ASESOR_MS;
  if (!conPausa && asesorActivo && ahora - ultimo.createdAt.getTime() < ESPERA_ASESOR_MS) {
    console.log(`[ali-redes] ${conv.id}: lo atiende un asesor; Ali retoma solo si pasan 2 h sin respuesta.`);
    await avisarMensajeAlAsesor(conv, plataforma, ultimo);
    return;
  }
  // Recién derivó ("te paso con un asesor"): Ali se calla 2 h aunque el
  // cliente siga escribiendo ("ok, gracias"), para que no conteste encima del
  // asesor. Si en 2 h nadie le respondió, retoma (Nicolás, 16-11-2026).
  const recienDerivada =
    !conPausa &&
    ultimoNuestro?.senderType === ALI_SENDER &&
    ultimoNuestro.sourceType === HANDOFF_SOURCE &&
    ahora - ultimoNuestro.createdAt.getTime() < ESPERA_ASESOR_MS;
  if (recienDerivada) {
    console.log(`[ali-redes] ${conv.id}: Ali derivó hace menos de 2 h; espera al asesor.`);
    await avisarMensajeAlAsesor(conv, plataforma, ultimo);
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
      // En WhatsApp el teléfono es el número desde el que escribe.
      cliente: {
        nombre: nombreLead || (plataforma === "whatsapp" ? conv.metaName : null) || null,
        telefono: lead?.phone || (plataforma === "whatsapp" ? `+${waIdDePsid(conv.psid)}` : null),
        email: lead?.email || null,
      },
      mensajes,
      memoria,
      agente,
    });
  } catch (error) {
    console.error(`[ali-redes] El sitio no respondió para ${conv.id}:`, error);
    await anotarFalla(conv.id, "el sitio no respondió");
    return;
  }

  // Los datos se guardan aunque después falle el envío.
  await procesarContacto(conv.id, plataforma, r.contacto, mensajes.filter((m) => m.de === "cliente").map((m) => m.texto));

  if (!r.burbujas.length) {
    // Silencio a propósito: no es una falla ni hay que avisar a una persona.
    if (r.silencio && !r.derivacion) {
      console.log(`[ali-redes] ${conv.id}: sin respuesta a propósito (solo agradeció o reaccionó).`);
      return;
    }
    await anotarFalla(conv.id, "la respuesta salió vacía");
    return;
  }
  if (await asesorEscribioDesde(conv.id, inicio)) return;
  // La pausaron mientras Ali pensaba la respuesta.
  if (await aliPausada(conv.id)) return;

  let conversationId = conv.id;
  const fuente = (i: number, total: number) => (r.derivacion && i === total - 1 ? HANDOFF_SOURCE : "DIRECT");

  if (plataforma === "whatsapp") {
    const waId = waIdDePsid(conv.psid);
    const desde = numeroDePsid(conv.psid); // Responde desde el número al que escribió el cliente.
    for (let i = 0; i < r.burbujas.length; i++) {
      if (i > 0) {
        await dormir(PAUSA_ENTRE_BURBUJAS_MS);
        if (await asesorEscribioDesde(conv.id, inicio)) return;
      }
      const id = await enviarTextoWhatsapp(waId, r.burbujas[i], desde);
      await guardar(conversationId, r.burbujas[i], id, fuente(i, r.burbujas.length));
    }
    await enviarDocumentos(conversationId, r.documentos, (d) => enviarArchivoWhatsapp(waId, d, desde));
  } else if (viaComentario && a.commentId) {
    // Meta permite un solo mensaje privado por comentario hasta que la persona
    // conteste: las burbujas van juntas en uno.
    // Con un solo mensaje no caben adjuntos: los documentos van como enlace.
    const enlaces = r.documentos.map((d) => `📎 ${d.nombre} ${d.url}`).join("\n");
    const texto = [r.burbujas.join("\n\n"), enlaces].filter(Boolean).join("\n\n");
    const privado = await graph("/me/messages", { recipient: { comment_id: a.commentId }, message: { text: texto } });
    recordar(privado.message_id);
    conversationId = await unirConChat(conv.id, privado.recipient_id);
    await guardar(conversationId, texto, privado.message_id, fuente(0, 1));
    // En público, solo "te escribimos por interno": sin precios (Marcela, 16-11-2026).
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
    await enviarDocumentos(conversationId, r.documentos, async (d) => {
      try {
        const msg = await graph("/me/messages", {
          recipient: { id: conv.psid },
          messaging_type: "RESPONSE",
          message: { attachment: { type: d.tipo === "imagen" ? "image" : "file", payload: { url: d.url, is_reusable: true } } },
        });
        recordar(msg.message_id);
        return msg.message_id as string;
      } catch (error) {
        // Instagram no siempre acepta PDF como adjunto: va el enlace.
        console.error(`[ali-redes] ${d.nombre} no salió como adjunto en ${plataforma}, va como enlace:`, error);
        const msg = await graph("/me/messages", {
          recipient: { id: conv.psid },
          messaging_type: "RESPONSE",
          message: { text: `📎 ${d.nombre} ${d.url}` },
        });
        recordar(msg.message_id);
        return msg.message_id as string;
      }
    });
  }

  const leadId =
    (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { leadId: true } }))?.leadId || null;
  if (r.visita) {
    const cuando = `${r.visita.proyecto} el ${r.visita.fecha} a las ${r.visita.hora}`;
    const resumen = (r.visita.resumen || "").trim().slice(0, 900) || null;
    await anotar(conversationId, `📅 Ali agendó una visita a ${cuando}.${resumen ? `\n📝 Para el asesor: ${resumen}` : ""}`);
    if (leadId) {
      // El asesor recibe todo el contexto (Nicolás, 22-11-2026): el resumen
      // queda en la ficha del lead y le llega en el aviso; el chat completo lo
      // ve en la bandeja (filtroBandeja incluye los chats con visita de Ali).
      await notaDeVisitaEnFicha(leadId, plataforma, cuando, resumen);
      // La visita la guía un asesor: pasa de inmediato.
      const pasado = await pasarAlAsesor(leadId, `agendó una visita a ${cuando}`, resumen);
      // El lead ya era de un asesor (no lo creó Ali): se le avisa a él.
      if (!pasado) await avisarVisitaAlAsesor(leadId, plataforma, cuando, resumen);
    }
  }
  if (r.derivacion) {
    // En los chats con "pausa hasta reactivar", derivar deja a Ali en pausa.
    await pausarSiCorresponde(conversationId, "Ali", "derivó a un asesor");
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
    documentos: documentosValidos(d.documentos, base),
  };
}

/** Hasta cuánto después del mensaje del cliente se avisa (los barridos de cada 10 min traen mensajes más viejos y no deben repetir el push). */
const AVISO_MENSAJE_RECIENTE_MS = 2 * 60 * 1000;

/**
 * El cliente escribió mientras lo atiende una persona (Ali derivó o un asesor
 * respondió hace poco): push al asesor del lead, como en el chat web. Sin
 * asesor (o si el lead sigue a cargo de Ali), a la rueda. Nunca lanza.
 */
async function avisarMensajeAlAsesor(
  conv: {
    id: string;
    leadId: string | null;
    metaName: string | null;
    lead: { firstName: string | null; lastName: string | null; assignedToId: string | null } | null;
  },
  plataforma: keyof typeof RED,
  ultimo: MensajeBase
) {
  try {
    if (Date.now() - ultimo.createdAt.getTime() > AVISO_MENSAJE_RECIENTE_MS) return;
    const dueno = conv.lead?.assignedToId;
    const destinatarios = dueno && dueno !== DUENO_MIENTRAS_ALI ? [dueno] : ASESORES_ANUNCIABLES;
    const nombre = [conv.lead?.firstName, conv.lead?.lastName].filter(Boolean).join(" ") || conv.metaName || "Un cliente";
    const texto = ultimo.text.length > 120 ? `${ultimo.text.slice(0, 117)}...` : ultimo.text;
    await Promise.allSettled(
      destinatarios.map((userId) =>
        createNotification({
          userId,
          title: `💬 ${nombre} escribió por ${RED[plataforma]}`,
          body: texto,
          // Mismo tipo que los demás avisos del chat: los APK descartan los tipos que no conocen.
          type: "NEW_LEAD",
          leadId: conv.leadId || undefined,
        })
      )
    );
  } catch (error) {
    console.error(`[ali-redes] No salió el push del mensaje de ${conv.id}:`, error);
  }
}

async function asesorEscribioDesde(conversationId: string, desde: Date) {
  const m = await prisma.message.findFirst({
    where: { conversationId, senderType: "advisor", createdAt: { gt: desde } },
    select: { id: true },
  });
  return Boolean(m);
}

/**
 * Nota de falla numerada desde el último mensaje del cliente ("intento 1",
 * "intento 2"). recuperarSinRespuesta cuenta estas notas para saber si
 * reintenta o se lo pasa a una persona.
 */
async function anotarFalla(conversationId: string, motivo: string) {
  const ultimoCliente = await prisma.message.findFirst({
    where: { conversationId, senderType: "meta" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const previas = await prisma.message.count({
    where: {
      conversationId,
      sourceType: EVENTO_SOURCE,
      text: { startsWith: FALLA },
      ...(ultimoCliente ? { createdAt: { gt: ultimoCliente.createdAt } } : {}),
    },
  });
  const intento = previas + 1;
  await anotar(
    conversationId,
    `${FALLA} (${motivo}), intento ${intento} de ${MAX_INTENTOS}. ${intento < MAX_INTENTOS ? "Se reintenta en unos minutos." : "Pasa a una persona."}`
  );
}

async function derivar(conversationId: string, plataforma: Plataforma, d: { motivo: string; resumen: string }) {
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
/** Errores de tipeo evidentes en el dominio: el respaldo automático no los guarda (Ali los corrige y pregunta). */
const CORREO_MAL_ESCRITO = /@(gmial|gmai|gamil|gnail|hotmial|hotmal|hormail|outlok|yaho)\.|\.(vom|con|cpm|xom|cim|comm|clm)$/i;
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

/**
 * ¿El correo que tiene el lead lo puso Ali desde este chat? (nota "✍️ Ali
 * completó … correo", "✍️ Ali corrigió el correo" o "🆕 Ali creó el lead").
 */
async function aliGuardoElCorreo(conversationId: string) {
  const nota = await prisma.message.findFirst({
    where: {
      conversationId,
      sourceType: EVENTO_SOURCE,
      OR: [
        { text: { startsWith: "✍️ Ali completó en la ficha", contains: "correo" } },
        { text: { startsWith: "✍️ Ali corrigió el correo" } },
        { text: { startsWith: "🆕 Ali creó el lead" } },
      ],
    },
    select: { id: true },
  });
  return Boolean(nota);
}

/** Respaldo sin IA: teléfono o correo escritos por el cliente que Ali no guardó. */
export function detectarContacto(textos: string[]) {
  let telefono: string | null = null;
  let email: string | null = null;
  for (const t of [...textos].reverse()) {
    // "jani.lemus @gmail.com" (espacios alrededor de la @) también cuenta; el
    // dominio no se corrige: eso lo hace Ali, que pregunta si quedó bien.
    if (!email) {
      const encontrado = normalizarCorreo(t.replace(/\s*@\s*/g, "@").match(CORREO)?.[0]);
      // ".vom", ".con", "gmial"…: mal escrito a la vista; no se guarda así.
      email = encontrado && !CORREO_MAL_ESCRITO.test(encontrado) ? encontrado : null;
    }
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
  plataforma: Plataforma,
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
      // Corrección (Nicolás, 22-11-2026): Ali guarda al tiro un correo con un
      // error evidente ya corregido y pregunta si quedó bien; si la persona lo
      // corrige, Ali manda el nuevo. Solo se reemplaza un correo que Ali misma
      // dejó en la ficha desde este chat, y solo con el que manda Ali (nunca
      // con el respaldo automático, que podría traer el correo mal escrito).
      const correoDeAli = normalizarCorreo(deAli?.email);
      let corregido = false;
      if (
        lead.email &&
        correoDeAli &&
        correoDeAli !== lead.email &&
        (await aliGuardoElCorreo(conv.id)) &&
        !(await prisma.lead.findUnique({ where: { email: correoDeAli }, select: { id: true } }))
      ) {
        datos.email = correoDeAli;
        corregido = true;
      }
      const nuevos = Object.keys(datos).filter((k) => !(corregido && k === "email"));
      const vincular = conv.leadId !== lead.id;
      if (!nuevos.length && !vincular && !corregido) return;

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
      if (corregido) await anotar(conv.id, `✍️ Ali corrigió el correo en la ficha.`);
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
      // Con resumen (derivación o visita) va lo que conversó con Ali; sin él, lo que busca.
      body: `${nombre} · ${motivo}${resumen ? ` · ${resumen}` : interes ? ` · ${interes}` : ""}`.slice(0, 300),
      leadId,
      type: "NEW_LEAD",
    }).catch((e) => console.error("[ali-redes] No salió el push del paso al asesor:", e));

    // En el grupo están todos los asesores: nunca teléfono ni correo. Una
    // falla técnica de Ali no se anuncia ahí (lo ven los gerentes), solo el push.
    if (!esFallaDeAli(motivo)) await avisarAlGrupo(
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
    oficinaDice("ali", `Pasé un lead de ${red} a un asesor`);
    return true;
  } catch (error) {
    console.error(`[ali-redes] No se pudo pasar el lead ${leadId} al asesor:`, error);
    return false;
  }
}

/**
 * Deja en la ficha del lead (lead_seguimientos) la visita que agendó Ali con
 * el resumen de la conversación, para que el asesor lo vea en la ficha del
 * CRM móvil y del CRM web. Va como NOTA con resultado propio: el calificador
 * IA reescribe sus notas con resultado "IA" y un seguimiento tipo VISITA se
 * leería como "llegó a la visita" (visitaRealizada.ts). Nunca lanza.
 */
async function notaDeVisitaEnFicha(leadId: string, plataforma: Plataforma, cuando: string, resumen: string | null) {
  try {
    const nota = `📅 Ali agendó por ${RED[plataforma]} una visita a ${cuando}.${resumen ? `\n${resumen}` : ""}`.slice(0, 1200);
    await prisma.$executeRaw`
      INSERT INTO lead_seguimientos (lead_id, usuario_id, tipo, resultado, nota)
      VALUES (${leadId}, NULL, 'NOTA', 'Visita agendada por Ali', ${nota})`;
  } catch (error) {
    console.error(`[ali-redes] No se pudo dejar la nota de visita en la ficha de ${leadId}:`, error);
  }
}

/**
 * La visita la agendó Ali, pero el lead ya era de un asesor (no lo creó
 * Ali, así que pasarAlAsesor no lo mueve): push a ese asesor con el resumen.
 * Si el lead no tiene asesor, la sincronización de visitas lo asigna por la
 * rueda y avisa. Nunca lanza.
 */
async function avisarVisitaAlAsesor(leadId: string, plataforma: Plataforma, cuando: string, resumen: string | null) {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { firstName: true, lastName: true, assignedToId: true },
    });
    if (!lead?.assignedToId || lead.assignedToId === DUENO_MIENTRAS_ALI) return;
    const nombre = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Tu cliente";
    await createNotification({
      userId: lead.assignedToId,
      title: `🤖 Ali agendó una visita por ${RED[plataforma]}`,
      body: `${nombre} · ${cuando}${resumen ? ` · ${resumen}` : ""}`.slice(0, 300),
      leadId,
      type: "VISIT",
    });
  } catch (error) {
    console.error(`[ali-redes] No salió el aviso de visita del lead ${leadId}:`, error);
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
       AND l.source = ANY(${FUENTES_IA})
       AND (s.score >= ${PUNTAJE_PARA_ASESOR} OR l."bookingId" IS NOT NULL)
     LIMIT 20`;
  let n = 0;
  for (const f of filas) {
    const motivo = f.visita ? "tiene una visita agendada" : `llegó a ${f.score} puntos de lead score`;
    if (await pasarAlAsesor(f.id, motivo)) n++;
  }
  return n;
}

/* ── Recuperar mensajes que Ali no alcanzó a responder ────────────────── */

/**
 * Conversaciones de IG/FB donde el último mensaje es del cliente (DM), lleva
 * más de 5 minutos sin respuesta y ningún asesor ha escrito (esas las ve
 * retomarPendientes). Si Ali ya falló MAX_INTENTOS veces, se la pasa a una
 * persona con aviso; si no, lo vuelve a intentar. Corre cada 10 minutos.
 */
export async function recuperarSinRespuesta() {
  const modo = modoAliRedes();
  const plataformas = plataformasConAli();
  if (!plataformas.length) return { reintentos: 0, aPersona: 0 };
  await asegurarTablaPausas();

  const filas = await prisma.$queryRaw<{ id: string; platform: string; lead_id: string | null; fallas: number }[]>`
    SELECT c.id, c.platform, c."leadId" AS lead_id,
           (SELECT count(*)::int FROM "Message" f
             WHERE f."conversationId" = c.id AND f."sourceType" = ${EVENTO_SOURCE}
               AND f.text LIKE ${FALLA + "%"} AND f."createdAt" > cl.fecha) AS fallas
      FROM "Conversation" c
      JOIN LATERAL (
        SELECT "createdAt" AS fecha, "sourceType" AS tipo FROM "Message"
         WHERE "conversationId" = c.id AND "senderType" = 'meta'
         ORDER BY "createdAt" DESC LIMIT 1
      ) cl ON true
     WHERE c.platform = ANY(${plataformas})
       AND cl.tipo = 'DIRECT'
       AND (cl.fecha AT TIME ZONE 'UTC') < now() - interval '5 minutes'
       AND (cl.fecha AT TIME ZONE 'UTC') > now() - interval '23 hours'
       AND NOT EXISTS (SELECT 1 FROM "Message" a WHERE a."conversationId" = c.id AND a."senderType" = 'advisor')
       AND NOT EXISTS (
         SELECT 1 FROM "Message" r
          WHERE r."conversationId" = c.id AND r."senderType" = 'ali'
            AND r."sourceType" <> ${EVENTO_SOURCE} AND r."createdAt" > cl.fecha
       )
       AND NOT EXISTS (
         SELECT 1 FROM "Message" n
          WHERE n."conversationId" = c.id AND n."sourceType" = ${EVENTO_SOURCE}
            AND n.text LIKE ${NOTA_PERSONA + "%"} AND n."createdAt" > cl.fecha
       )
       AND NOT EXISTS (SELECT 1 FROM public.ali_pausas p WHERE p.conversation_id = c.id)
     ORDER BY cl.fecha
     LIMIT 20`;

  let reintentos = 0;
  let aPersona = 0;
  for (const f of filas) {
    if (turnos.has(f.id)) continue;
    if (f.platform !== "whatsapp" && modo === "prueba" && !(await esCuentaDePrueba(f.id))) continue;
    if (f.fallas >= MAX_INTENTOS) {
      aPersona++;
      await pasarAPersona(f.id, f.lead_id);
      continue;
    }
    reintentos++;
    programar({ conversationId: f.id, plataforma: f.platform as Plataforma, via: "dm", texto: "", nueva: false, conTexto: false });
  }
  return { reintentos, aPersona };
}

/** Después de los reintentos: si el lead es de Ali pasa a la rueda; siempre queda la nota ⚠️ en la bandeja. */
async function pasarAPersona(conversationId: string, leadId: string | null) {
  const motivo = `Ali no pudo responder después de ${MAX_INTENTOS} intentos`;
  await pausarSiCorresponde(conversationId, "Ali", "no pudo responder y pasó a una persona");
  const pasado = leadId ? await pasarAlAsesor(leadId, motivo) : false;
  // Solo push al asesor: el grupo de leads no recibe fallas técnicas (Nicolás, 22-11-2026).
  await pedirUnaPersona(conversationId, `${motivo}. El cliente está esperando: respóndele desde aquí.`, motivo, { avisar: !pasado, alGrupo: false });
}

/* ── Retomar cuando el asesor no responde ─────────────────────────────── */

/**
 * Conversaciones de IG/FB donde un asesor ya escribió, el cliente volvió a
 * escribir y lleva más de 2 h (y menos de 24 h) sin respuesta: Ali retoma.
 */
export async function retomarPendientes() {
  const modo = modoAliRedes();
  const plataformas = plataformasConAli();
  if (!plataformas.length) return 0;
  await asegurarTablaPausas();

  const filas = await prisma.$queryRaw<{ id: string; platform: string; lead_id: string | null; fallas: number }[]>`
    SELECT c.id, c.platform, c."leadId" AS lead_id,
           (SELECT count(*)::int FROM "Message" f
             WHERE f."conversationId" = c.id AND f."sourceType" = ${EVENTO_SOURCE}
               AND f.text LIKE ${FALLA + "%"} AND f."createdAt" > cl.fecha) AS fallas
      FROM "Conversation" c
      JOIN LATERAL (
        SELECT "createdAt" AS fecha FROM "Message"
         WHERE "conversationId" = c.id AND "senderType" = 'meta' AND "sourceType" = 'DIRECT'
         ORDER BY "createdAt" DESC LIMIT 1
      ) cl ON true
     WHERE c.platform = ANY(${plataformas})
       AND (cl.fecha AT TIME ZONE 'UTC') < now() - interval '2 hours'
       AND (cl.fecha AT TIME ZONE 'UTC') > now() - interval '23 hours'
       AND EXISTS (SELECT 1 FROM "Message" a WHERE a."conversationId" = c.id AND a."senderType" = 'advisor')
       AND NOT EXISTS (
         SELECT 1 FROM "Message" r
          WHERE r."conversationId" = c.id AND r."senderType" IN ('advisor', 'ali')
            AND r."sourceType" <> ${EVENTO_SOURCE} AND r."createdAt" > cl.fecha
       )
       AND NOT EXISTS (
         SELECT 1 FROM "Message" n
          WHERE n."conversationId" = c.id AND n."sourceType" = ${EVENTO_SOURCE}
            AND n.text LIKE ${NOTA_PERSONA + "%"} AND n."createdAt" > cl.fecha
       )
       AND NOT EXISTS (SELECT 1 FROM public.ali_pausas p WHERE p.conversation_id = c.id)
     LIMIT 20`;

  let n = 0;
  for (const f of filas) {
    if (turnos.has(f.id)) continue;
    if (f.platform !== "whatsapp" && modo === "prueba" && !(await esCuentaDePrueba(f.id))) continue;
    // Antes reintentaba cada 10 minutos sin tope (y se pagaba cada vuelta).
    if (f.fallas >= MAX_INTENTOS) {
      await pasarAPersona(f.id, f.lead_id);
      continue;
    }
    n++;
    programar({
      conversationId: f.id,
      plataforma: f.platform as Plataforma,
      via: "dm",
      texto: "",
      nueva: false,
      conTexto: false,
    });
  }
  return n;
}

/** Canales donde Ali está encendida: IG/FB según ALI_REDES_ACTIVA, WhatsApp según ALI_WHATSAPP_ACTIVA. */
function plataformasConAli(): string[] {
  if (!process.env.IA_SECRET) return [];
  const lista: string[] = [];
  if (modoAliRedes() !== "apagada" && respuestaAutoActiva()) lista.push("instagram", "facebook");
  if (aliWhatsappActiva()) lista.push("whatsapp");
  return lista;
}

/* ── WhatsApp ─────────────────────────────────────────────────────────── */

/**
 * Un mensaje de WhatsApp recién guardado: Ali lo marca como leído, muestra
 * "escribiendo…" y responde con la misma espera de ráfaga que en IG/FB.
 * Nunca lanza: corre después del 200 a Meta.
 */
export async function atenderWhatsapp(
  conversationId: string,
  mensajeId: string,
  publicacion: string | null,
  desde?: string | null
) {
  try {
    if (!aliWhatsappActiva() || !process.env.IA_SECRET) return;
    await marcarLeidoWhatsapp(mensajeId, desde);
    programar({ conversationId, plataforma: "whatsapp", via: "dm", texto: "", publicacion, nueva: false, conTexto: true });
  } catch (error) {
    console.error("[ali-whatsapp] Error atendiendo el mensaje:", error);
  }
}

/**
 * Recién reactivada desde el CRM web (lib/pausaAli.ts): si lo último del chat
 * es un mensaje del cliente sin responder, Ali lo responde ahora y no espera al
 * barrido de cada 10 minutos. responder() vuelve a revisar todo (24 h, pausa,
 * último mensaje), así que llamarla de más no hace daño. Nunca lanza.
 */
export function atenderAlReactivar(conversationId: string, plataforma: string) {
  try {
    // Solo WhatsApp: en IG/FB el modo "prueba" se revisa en otro lado y esto lo saltaría.
    if (plataforma !== "whatsapp" || !plataformasConAli().includes("whatsapp")) return;
    programar({ conversationId, plataforma: "whatsapp", via: "dm", texto: "", nueva: false, conTexto: true });
  } catch (error) {
    console.error(`[ali-redes] No se pudo retomar ${conversationId} al reactivar:`, error);
  }
}

/**
 * WhatsApp trae el teléfono: la conversación se vincula al lead que ya tenga
 * ese número o se crea uno "WhatsApp - IA" a cargo de Nicolás mientras lo
 * atiende Ali (mismas reglas que IG/FB). Nunca lanza.
 */
export async function vincularLeadWhatsapp(conversationId: string, waId: string, nombre: string | null) {
  const telefono = normalizarTelefono(`+${waId.replace(/\D/g, "")}`);
  if (!telefono) return;
  await procesarContacto(conversationId, "whatsapp", { nombre, telefono, email: null, interes: null }, []);
}
