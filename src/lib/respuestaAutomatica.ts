import prisma from "./prisma";

/**
 * Respuesta automática de Instagram y Facebook.
 *
 * Cuando alguien comenta una publicación o escribe su primer DM, la IA solo
 * CLASIFICA qué está pidiendo (Lomas del Mar, Arena y Sol, info general,
 * visita, otro). El texto que se manda es siempre una plantilla fija de este
 * archivo: la IA no redacta nada, así no puede inventar precios ni plazos.
 *
 * - Comentario: respuesta pública corta + un mensaje privado (private reply)
 *   con el enlace al brochure. Meta permite un solo mensaje privado por
 *   comentario hasta que la persona conteste.
 * - Primer DM: la portada del brochure como imagen + el texto con el enlace.
 *
 * Después de eso calla: la conversación sigue con el asesor en la bandeja.
 * Se responde una vez por persona cada DIAS_ENTRE_RESPUESTAS, y nunca si un
 * asesor ya escribió.
 *
 * Los mensajes se guardan con senderType "ali" y sourceType "AUTO", y cuando
 * la persona abre el brochure aliminspa.cl avisa y queda una nota "EVENTO".
 *
 * Env: META_PAGE_ACCESS_TOKEN (ya existía), ANTHROPIC_API_KEY (sin ella se
 * clasifica por palabras clave) y RESPUESTA_AUTO_ACTIVA=false para apagarla.
 */

export const AUTO_SOURCE = "AUTO";
export const EVENTO_SOURCE = "EVENTO";
const ALI_SENDER = "ali";

const GRAPH = "https://graph.facebook.com/v21.0";
const SITIO = "https://aliminspa.cl";
const MODELO = process.env.RESPUESTA_AUTO_MODELO || "claude-haiku-5-5";
const DIAS_ENTRE_RESPUESTAS = 7;

export type Categoria = "lomas" | "arena" | "general" | "visita" | "otro" | "ignorar";
export type Via = "comentario" | "dm";

export function respuestaAutoActiva() {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN) && process.env.RESPUESTA_AUTO_ACTIVA !== "false";
}

/* ── Ids que mandó este proceso ──────────────────────────────────────
 * Meta devuelve como webhook lo que manda la página (ecos de DM y la
 * respuesta pública al comentario). Lo que mandó la respuesta automática ya
 * está guardado como "ali", así que esos avisos se ignoran. Se recuerdan acá
 * porque el webhook puede llegar antes de que termine de guardarse. */
const enviados = new Set<string>();
function recordar(id?: string | null) {
  if (!id) return;
  enviados.add(id);
  setTimeout(() => enviados.delete(id), 10 * 60 * 1000).unref?.();
}
export function loEnvioLaRespuestaAuto(id?: string | null) {
  return Boolean(id && enviados.has(id));
}

/* ── Clasificación ─────────────────────────────────────────────────── */

const INSTRUCCIONES = `Clasificas mensajes que la gente deja en Instagram y Facebook de Alimin, una inmobiliaria chilena que vende terrenos urbanizados en El Tabo (Litoral Central). Hay dos proyectos en venta: "Lomas del Mar" (terrenos de 200 y 390 m²) y "Arena y Sol" (terrenos de 200 m²). Recibes el texto de la publicación (si lo hay) y el mensaje de la persona.

Categorías:
- lomas: pregunta o muestra interés por Lomas del Mar (o la publicación es de Lomas del Mar y pide info/precio/cuotas).
- arena: lo mismo, pero de Arena y Sol.
- general: pide info, precio, cuotas, ubicación, financiamiento, "+info", "me interesa", sin que se sepa el proyecto.
- visita: quiere ir a ver los terrenos, agendar o pregunta cuándo se puede visitar.
- otro: reclamo, postventa, ya es cliente, pregunta que no es de compra, insulto, o algo que necesita a una persona.
- ignorar: no pide nada: emojis, felicitaciones, "qué lindo", etiqueta a otra persona sin preguntar, spam.

Si duda entre un proyecto y general, usa general. Responde solo con la herramienta.`;

const HERRAMIENTA = {
  name: "clasificar",
  description: "Devuelve la categoría del mensaje.",
  input_schema: {
    type: "object",
    properties: {
      categoria: { type: "string", enum: ["lomas", "arena", "general", "visita", "otro", "ignorar"] },
    },
    required: ["categoria"],
  },
};

/** Respaldo sin IA (sin API key o si la API falla). */
export function clasificarPorPalabras(texto: string, publicacion?: string | null): Categoria {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const p = (publicacion || "").toLowerCase();
  if (/reclamo|estafa|devoluc|mi lote|mi terreno|ya compre|escritura|postventa/.test(t)) return "otro";
  if (/visit|ir a ver|conocer|agend|recorr/.test(t)) return "visita";
  if (/lomas/.test(t)) return "lomas";
  if (/arena/.test(t)) return "arena";
  if (/info|precio|valor|cuanto|cuota|credit|financ|pie|ubicac|donde|interes|disponib|\?/.test(t)) {
    if (/lomas del mar/.test(p) && !/arena y sol/.test(p)) return "lomas";
    if (/arena y sol/.test(p) && !/lomas del mar/.test(p)) return "arena";
    return "general";
  }
  return "ignorar";
}

export async function clasificar(texto: string, publicacion?: string | null): Promise<Categoria> {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) return clasificarPorPalabras(texto, publicacion);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 100,
        system: INSTRUCCIONES,
        tools: [HERRAMIENTA],
        tool_choice: { type: "tool", name: "clasificar" },
        messages: [
          {
            role: "user",
            content: `Publicación: ${(publicacion || "(sin texto)").slice(0, 600)}\n\nMensaje de la persona: ${texto.slice(0, 1000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    const uso = d?.content?.find((c: any) => c.type === "tool_use");
    const cat = uso?.input?.categoria as Categoria | undefined;
    if (cat && ["lomas", "arena", "general", "visita", "otro", "ignorar"].includes(cat)) return cat;
    console.error("[auto] Respuesta rara de la IA:", JSON.stringify(d).slice(0, 300));
  } catch (error) {
    console.error("[auto] La IA no respondió, uso palabras clave:", error);
  }
  return clasificarPorPalabras(texto, publicacion);
}

/* ── Plantillas ────────────────────────────────────────────────────── */

const PUBLICAS = [
  "¡Hola! Te escribimos por interno 📩",
  "¡Gracias por comentar! Te mandamos la info por mensaje privado 📩",
  "¡Hola! Te enviamos los detalles por interno 😊",
];

/* Enlace corto: aliminspa.cl/b/<destino><red><vía><categoría><8 primeros del id>,
 * p. ej. aliminspa.cl/b/liclf8f75795. El sitio (src/app/b/[codigo]) lo expande
 * a la página con los utm completos y r=<id>, así que la medición no cambia y
 * el mensaje no lleva una URL de tres líneas. */
const DESTINO: Record<string, string> = {
  "/brochure/lomas-del-mar": "l",
  "/brochure/arena-y-sol": "a",
  "/agendar-visita": "v",
};
const CATEGORIA_CORTA: Record<Categoria, string> = {
  lomas: "l", arena: "a", general: "g", visita: "v", otro: "o", ignorar: "x",
};

function enlace(ruta: string, plataforma: string, via: Via, categoria: Categoria, conversationId: string) {
  const codigo =
    DESTINO[ruta] +
    (plataforma === "instagram" ? "i" : "f") +
    (via === "comentario" ? "c" : "d") +
    CATEGORIA_CORTA[categoria] +
    conversationId.replace(/-/g, "").slice(0, 8);
  // Con https: Instagram no siempre convierte en enlace un dominio pelado.
  return `${SITIO}/b/${codigo}`;
}

function saludo(nombre?: string | null) {
  const n = (nombre || "").trim().split(/\s+/)[0];
  // En Instagram solo viene el usuario (@algo): no se usa como nombre.
  return n && !/[_.\d@]/.test(n) && n.length <= 20 ? `¡Hola ${n}! 👋` : "¡Hola! 👋";
}

export interface Plantilla {
  texto: string;
  /** Portada del brochure para mandar como imagen antes del texto (solo DM). */
  imagen: string | null;
  publica: string;
}

export function plantilla(
  categoria: Categoria,
  ctx: { nombre?: string | null; plataforma: string; via: Via; conversationId: string }
): Plantilla | null {
  const l = (ruta: string) => enlace(ruta, ctx.plataforma, ctx.via, categoria, ctx.conversationId);
  const hola = saludo(ctx.nombre);
  const cierre = "Un asesor comercial seguirá la conversación en este chat.";
  const publica = PUBLICAS[Math.floor(Math.random() * PUBLICAS.length)];

  switch (categoria) {
    case "lomas":
      return {
        texto: `${hola} Gracias por tu interés en Lomas del Mar, nuestros terrenos urbanizados de 200 y 390 m² en El Tabo.\n\nAcá puedes ver el brochure completo:\n${l("/brochure/lomas-del-mar")}\n\n${cierre}`,
        imagen: `${SITIO}/brochures/lomas-del-mar/portada.jpg`,
        publica,
      };
    case "arena":
      return {
        texto: `${hola} Gracias por tu interés en Arena y Sol, nuestros terrenos urbanizados de 200 m² en El Tabo.\n\nAcá puedes ver el brochure completo:\n${l("/brochure/arena-y-sol")}\n\n${cierre}`,
        imagen: `${SITIO}/brochures/arena-y-sol/portada.jpg`,
        publica,
      };
    case "general":
      return {
        texto: `${hola} Gracias por escribirnos. Tenemos terrenos urbanizados en El Tabo en dos proyectos; te dejo los brochures:\n\n🌲 Lomas del Mar (200 y 390 m²):\n${l("/brochure/lomas-del-mar")}\n\n☀️ Arena y Sol (200 m²):\n${l("/brochure/arena-y-sol")}\n\n${cierre}`,
        imagen: null,
        publica,
      };
    case "visita":
      return {
        texto: `${hola} ¡Claro que puedes venir a conocer los terrenos! Las visitas son presenciales y las puedes agendar acá:\n${l("/agendar-visita")}\n\nSi quieres ver la info antes, te dejo los brochures:\nLomas del Mar: ${l("/brochure/lomas-del-mar")}\nArena y Sol: ${l("/brochure/arena-y-sol")}\n\n${cierre}`,
        imagen: null,
        publica,
      };
    default:
      return null;
  }
}

const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  lomas: "Lomas del Mar",
  arena: "Arena y Sol",
  general: "info general",
  visita: "visita",
  otro: "otro (sin plantilla)",
  ignorar: "sin pregunta",
};

/* ── Envío por Graph API ───────────────────────────────────────────── */

async function graph(path: string, body: unknown, base = GRAPH, token = process.env.META_PAGE_ACCESS_TOKEN as string) {
  const r = await fetch(`${base}${path}?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    throw new Error(`Meta ${d?.error?.code}/${d?.error?.error_subcode}: ${d?.error?.message || r.status}`);
  }
  return d;
}

/* ── Orquestación ──────────────────────────────────────────────────── */

/** ¿Ya se le respondió hace poco o ya lo atiende un asesor? */
/** PSID de cuentas de prueba (RESPUESTA_AUTO_PRUEBA, separados por coma):
 * se les responde siempre, sin el límite de una respuesta cada 7 días. */
async function esCuentaDePrueba(conversationId: string) {
  const lista = (process.env.RESPUESTA_AUTO_PRUEBA || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!lista.length) return false;
  // Vale el PSID o el comienzo del id de la conversación (el que se ve en la
  // URL del CRM, /inbox/<id>), que es más fácil de encontrar.
  if (lista.some((x) => conversationId.startsWith(x.toLowerCase()))) return true;
  const c = await (prisma as any).conversation.findUnique({ where: { id: conversationId }, select: { psid: true } });
  return Boolean(c && lista.includes(c.psid));
}

async function yaAtendida(conversationId: string) {
  if (await esCuentaDePrueba(conversationId)) return false;
  const desde = new Date(Date.now() - DIAS_ENTRE_RESPUESTAS * 24 * 60 * 60 * 1000);
  const previo = await (prisma as any).message.findFirst({
    where: {
      conversationId,
      OR: [
        { senderType: "advisor", createdAt: { gte: desde } },
        { senderType: ALI_SENDER, sourceType: AUTO_SOURCE, createdAt: { gte: desde } },
      ],
    },
    select: { id: true },
  });
  return Boolean(previo);
}

async function guardar(conversationId: string, text: string, sourceId?: string | null, sourceType = AUTO_SOURCE) {
  await (prisma as any).message.create({
    data: { conversationId, text, senderType: ALI_SENDER, sourceType, sourceId: sourceId || null },
  });
  await (prisma as any).conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

/** Nota interna para el asesor (no se le manda al cliente). */
export async function anotar(conversationId: string, text: string) {
  await guardar(conversationId, text, null, EVENTO_SOURCE);
}

export interface Entrada {
  conversationId: string;
  plataforma: "instagram" | "facebook";
  via: Via;
  texto: string;
  nombre?: string | null;
  /** Texto de la publicación, para entender a qué proyecto se refiere. */
  publicacion?: string | null;
  /** Solo comentarios. */
  commentId?: string;
}

/**
 * Clasifica y responde. Nunca lanza: si algo falla queda en el log y la
 * conversación sigue en la bandeja como siempre.
 */
export async function responderAutomatico(e: Entrada) {
  // Cada salida deja su línea: sin ellas no se sabe por qué no respondió.
  if (!respuestaAutoActiva()) {
    console.log(
      `[auto] Apagada: META_PAGE_ACCESS_TOKEN ${process.env.META_PAGE_ACCESS_TOKEN ? "ok" : "FALTA"}, ` +
        `RESPUESTA_AUTO_ACTIVA=${JSON.stringify(process.env.RESPUESTA_AUTO_ACTIVA ?? null)}`,
    );
    return;
  }
  if (!e.texto.trim()) {
    console.log(`[auto] ${e.plataforma}/${e.via}: sin texto, no respondo.`);
    return;
  }
  console.log(`[auto] Recibido ${e.plataforma}/${e.via} en ${e.conversationId}`);
  try {
    if (await yaAtendida(e.conversationId)) {
      console.log(`[auto] ${e.conversationId}: ya tuvo respuesta de asesor o automática en ${DIAS_ENTRE_RESPUESTAS} días, no respondo.`);
      return;
    }

    const categoria = await clasificar(e.texto, e.publicacion);
    console.log(`[auto] ${e.plataforma}/${e.via} → ${categoria}: ${e.texto.slice(0, 80)}`);
    if (categoria === "ignorar") return;

    const p = plantilla(categoria, {
      nombre: e.nombre,
      plataforma: e.plataforma,
      via: e.via,
      conversationId: e.conversationId,
    });
    if (!p) {
      await anotar(e.conversationId, `Respuesta automática: no se envió nada (${NOMBRE_CATEGORIA[categoria]}). Lo atiende un asesor.`);
      return;
    }

    let conversationId = e.conversationId;

    if (e.via === "comentario" && e.commentId) {
      // 1. Mensaje privado. Meta devuelve el PSID/IGSID con que se abre el
      //    chat; en Facebook puede no ser el mismo id del comentario.
      const privado = await graph("/me/messages", {
        recipient: { comment_id: e.commentId },
        message: { text: p.texto },
      });
      recordar(privado.message_id);
      conversationId = await unirConChat(e.conversationId, privado.recipient_id);
      await guardar(conversationId, p.texto, privado.message_id);

      // 2. Respuesta pública bajo el comentario. En Instagram se prueba primero
      //    el token de inicio de sesión de Instagram (IGAA…) y después el de la
      //    página; si ninguno puede, el error de Meta queda como nota en la
      //    conversación para verlo sin abrir los logs.
      const intentos: Array<() => Promise<any>> =
        e.plataforma === "instagram"
          ? [
              ...(process.env.META_INSTAGRAM_ACCESS_TOKEN
                ? [() => graph(`/${e.commentId}/replies`, { message: p.publica }, "https://graph.instagram.com/v21.0", process.env.META_INSTAGRAM_ACCESS_TOKEN as string)]
                : []),
              () => graph(`/${e.commentId}/replies`, { message: p.publica }),
            ]
          : [() => graph(`/${e.commentId}/comments`, { message: p.publica })];
      const errores: string[] = [];
      for (const intento of intentos) {
        try {
          const pub = await intento();
          recordar(pub.id);
          await guardar(conversationId, `(Respuesta pública al comentario) ${p.publica}`, pub.id);
          errores.length = 0;
          break;
        } catch (error) {
          errores.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (errores.length) {
        console.error("[auto] No se pudo responder en público:", errores.join(" | "));
        await anotar(conversationId, `No se pudo responder en público el comentario: ${errores.join(" | ")}`.slice(0, 500));
      }
    } else {
      // DM: la ventana de 24 h está abierta porque la persona acaba de escribir.
      const psid = await psidDe(conversationId);
      if (!psid) return;
      if (p.imagen) {
        try {
          const img = await graph("/me/messages", {
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: { attachment: { type: "image", payload: { url: p.imagen, is_reusable: true } } },
          });
          recordar(img.message_id);
        } catch (error) {
          console.error("[auto] No se pudo mandar la portada:", error);
        }
      }
      const msg = await graph("/me/messages", {
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { text: p.texto },
      });
      recordar(msg.message_id);
      await guardar(conversationId, p.imagen ? `[Portada del brochure]\n\n${p.texto}` : p.texto, msg.message_id);
    }

    await anotar(conversationId, `Respuesta automática enviada: ${NOMBRE_CATEGORIA[categoria]}.`);
  } catch (error) {
    console.error("[auto] Error en la respuesta automática:", error);
  }
}

async function psidDe(conversationId: string): Promise<string | null> {
  const c = await (prisma as any).conversation.findUnique({ where: { id: conversationId }, select: { psid: true } });
  return c?.psid || null;
}

/**
 * Si el mensaje privado se abrió con un id distinto al del comentario, se
 * junta todo en una sola conversación para que el asesor vea el comentario y
 * el chat juntos y su respuesta vaya por DM.
 */
async function unirConChat(conversationId: string, recipientId?: string | null): Promise<string> {
  if (!recipientId) return conversationId;
  const actual = await (prisma as any).conversation.findUnique({ where: { id: conversationId } });
  if (!actual || actual.psid === recipientId) return conversationId;

  const otra = await (prisma as any).conversation.findUnique({ where: { psid: recipientId } });
  if (!otra) {
    await (prisma as any).conversation.update({ where: { id: conversationId }, data: { psid: recipientId } });
    return conversationId;
  }
  // Ya había un chat con esa persona: el comentario se pasa a ese chat.
  await (prisma as any).message.updateMany({ where: { conversationId }, data: { conversationId: otra.id } });
  if (!otra.leadId && actual.leadId) {
    await (prisma as any).conversation.update({ where: { id: otra.id }, data: { leadId: actual.leadId } });
  }
  await (prisma as any).conversation.delete({ where: { id: conversationId } }).catch(() => {});
  return otra.id;
}

/** aliminspa.cl avisa que la persona abrió un brochure. */
export async function registrarBrochureAbierto(conversationId: string, brochure: string) {
  const nombre = brochure === "arena-y-sol" ? "Arena y Sol" : "Lomas del Mar";
  const texto = `📄 Abrió el brochure de ${nombre}.`;
  // Una nota por brochure cada 6 horas: recargar la página no suma.
  const reciente = await (prisma as any).message.findFirst({
    where: { conversationId, sourceType: EVENTO_SOURCE, text: texto, createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) } },
    select: { id: true },
  });
  if (reciente) return false;
  await anotar(conversationId, texto);
  return true;
}
