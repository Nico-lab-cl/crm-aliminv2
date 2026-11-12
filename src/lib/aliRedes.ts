import prisma from "./prisma";
import { BARBARA_ID, MARCELA_ID, ORLANDO_ID, getNextAdvisorId } from "./assignment";
import { createNotification } from "./notifications";
import { ALI_SENDER, HANDOFF_SOURCE, avisarDerivacion } from "./ali";
import {
  EVENTO_SOURCE,
  anotar,
  clasificar,
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

    if (a.via === "comentario") {
      // Emojis, etiquetas a amigos y "qué lindo" no se contestan.
      const categoria = await clasificar(a.texto, a.publicacion, { canal: a.plataforma, conversationId: a.conversationId });
      if (categoria === "ignorar") {
        console.log(`[ali-redes] Comentario sin pregunta en ${a.conversationId}, no respondo.`);
        return;
      }
      if (categoria === "otro") {
        await comentarioDelicado(a);
        return;
      }
    }
    programar(a);
  } catch (error) {
    console.error("[ali-redes] Error atendiendo el aviso de Meta:", error);
  }
}

/* ── Comentarios delicados ────────────────────────────────────────────── */

/**
 * Reclamos, "estafa", insultos, postventa o algo que pide una persona
 * (categoría "otro" del clasificador). Nicolás pidió armar un protocolo de
 * respuesta más adelante (11-11-2026). Mientras tanto Ali NO contesta, ni en
 * público ni por privado: queda una nota para que lo vea una persona, igual
 * que hacía la plantilla. Cuando exista el protocolo, se implementa acá.
 */
async function comentarioDelicado(a: AvisoMeta) {
  console.log(`[ali-redes] Comentario delicado en ${a.conversationId}: queda para el equipo.`);
  await anotar(
    a.conversationId,
    "⚠️ Comentario delicado (reclamo, desconfianza, insulto o postventa). Ali no respondió: falta el protocolo de respuesta, lo revisa una persona."
  );
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

  // Asesor atendiendo: Ali solo entra si el cliente lleva 2 h sin respuesta.
  const ultimoAsesor = [...conversacion].reverse().find((m) => m.senderType === "advisor");
  if (ultimoAsesor && ahora - ultimo.createdAt.getTime() < ESPERA_ASESOR_MS) {
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
  const mensajes: MensajeIA[] = conversacion.slice(-40).flatMap((m): MensajeIA[] => {
    if (m.senderType === "meta") {
      const esImagen = /^\[imagen\]$/i.test(m.text);
      const texto = m.sourceType === "COMMENT" ? `(Comentó en la publicación) ${m.text}` : m.text;
      return [{ de: "cliente", texto, imagenUrl: esImagen && m.mediaUrl ? m.mediaUrl : null }];
    }
    if (m.senderType === ALI_SENDER) {
      if (m.text.startsWith("(Respuesta pública")) return [];
      return [{ de: "ali", texto: m.text.replace(/^\[Portada del brochure\]\s*/, "") }];
    }
    if (m.senderType === "advisor") return [{ de: "asesor", texto: m.text }];
    return [];
  });

  const lead = conv.lead;
  const nombreLead = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || null;
  const publicacion = a.publicacion || null;

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

  if (r.visita) {
    await anotar(conversationId, `📅 Ali agendó una visita a ${r.visita.proyecto} el ${r.visita.fecha} a las ${r.visita.hora}.`);
  }
  if (r.derivacion) await derivar(conversationId, plataforma, r.derivacion);
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

    const source = `${red} - IA`;
    const assignedToId = await getNextAdvisorId([MARCELA_ID, ORLANDO_ID, BARBARA_ID], source);
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
          assignedToId,
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

    const asesor = assignedToId ? await prisma.user.findUnique({ where: { id: assignedToId }, select: { name: true } }) : null;
    await anotar(conv.id, `🆕 Ali creó el lead con los datos que dio el cliente${asesor?.name ? ` y quedó asignado a ${asesor.name}` : ""}.`);
    if (assignedToId) {
      await createNotification({
        userId: assignedToId,
        title: `📲 Nuevo lead de ${red} (Ali)`,
        body: `${nombre || conv.metaName || "Cliente"}${interes ? ` · ${interes}` : ""}`.slice(0, 160),
        leadId: creado.id,
        type: "NEW_LEAD",
      }).catch((e) => console.error("[ali-redes] No salió el push del lead nuevo:", e));
    }
  } catch (error) {
    console.error(`[ali-redes] No se pudo guardar el contacto de ${conversationId}:`, error);
  }
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
