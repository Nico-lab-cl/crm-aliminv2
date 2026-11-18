/**
 * WhatsApp por la API oficial de Meta (Cloud API), con un número dedicado a
 * Ali (decisión de Nicolás, 15-11-2026): número nuevo, prueba con un conjunto
 * de anuncios y los asesores responden desde la bandeja del CRM por el mismo
 * número.
 *
 * Variables (EasyPanel → CRM móvil → Entorno):
 *   WHATSAPP_TOKEN            token permanente de un usuario del sistema con
 *                             whatsapp_business_messaging (lo pega una persona).
 *   WHATSAPP_PHONE_NUMBER_ID  identificador del número (WhatsApp Manager).
 *   WHATSAPP_VERIFY_TOKEN     texto que se pone en la app de Meta al configurar
 *                             el webhook (si falta, META_VERIFY_TOKEN).
 *   ALI_WHATSAPP_ACTIVA       "false" apaga a Ali en WhatsApp (los mensajes se
 *                             siguen guardando y los ve el asesor).
 * La firma del webhook usa META_APP_SECRET, la misma app que IG/FB.
 */

export const WA_PLATFORM = "whatsapp";
const VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

/** psid de la conversación: el número de WhatsApp del cliente con prefijo, para no chocar con los de Meta. */
export const psidWhatsapp = (waId: string) => `wa:${waId.replace(/\D/g, "")}`;
export const waIdDePsid = (psid: string) => psid.replace(/^wa:/, "");

export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function aliWhatsappActiva() {
  return whatsappConfigurado() && (process.env.ALI_WHATSAPP_ACTIVA || "").trim().toLowerCase() !== "false";
}

export class ErrorWhatsapp extends Error {
  detalle: { code?: number; error_subcode?: number; message?: string } | null;
  constructor(message: string, detalle: ErrorWhatsapp["detalle"]) {
    super(message);
    this.detalle = detalle;
  }
}

async function llamar(cuerpo: Record<string, unknown>) {
  const token = process.env.WHATSAPP_TOKEN;
  const numero = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numero) throw new ErrorWhatsapp("WhatsApp no está configurado (faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID).", null);
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${numero}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    signal: AbortSignal.timeout(15000),
  });
  const d = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: ErrorWhatsapp["detalle"] };
  if (!res.ok || d.error) {
    throw new ErrorWhatsapp(`WhatsApp respondió ${res.status}: ${d.error?.message || "sin detalle"}`, d.error ?? null);
  }
  return d;
}

/** Manda un texto. Devuelve el id del mensaje en WhatsApp (wamid). */
export async function enviarTextoWhatsapp(waId: string, texto: string): Promise<string | null> {
  const d = await llamar({
    recipient_type: "individual",
    to: waId.replace(/\D/g, ""),
    type: "text",
    text: { body: texto.slice(0, 4000), preview_url: false },
  });
  return d.messages?.[0]?.id ?? null;
}

/** Manda una imagen o un PDF por URL pública (planos, brochures). Devuelve el wamid. */
export async function enviarArchivoWhatsapp(
  waId: string,
  archivo: { nombre: string; tipo: "pdf" | "imagen"; url: string }
): Promise<string | null> {
  const d = await llamar({
    recipient_type: "individual",
    to: waId.replace(/\D/g, ""),
    ...(archivo.tipo === "imagen"
      ? { type: "image", image: { link: archivo.url, caption: archivo.nombre } }
      : { type: "document", document: { link: archivo.url, filename: `${archivo.nombre} - Alimin.pdf` } }),
  });
  return d.messages?.[0]?.id ?? null;
}

/** Marca el mensaje del cliente como leído y muestra "escribiendo…" mientras Ali piensa. Nunca lanza. */
export async function marcarLeidoWhatsapp(mensajeId: string) {
  try {
    await llamar({ status: "read", message_id: mensajeId, typing_indicator: { type: "text" } });
  } catch (error) {
    console.warn("[whatsapp] No se pudo marcar como leído:", (error as Error).message);
  }
}

/**
 * Explica en palabras del asesor por qué WhatsApp no dejó mandar el mensaje.
 * 131047: pasaron más de 24 h desde el último mensaje del cliente (hace falta
 * una plantilla aprobada). 131026: el número no puede recibir mensajes.
 */
export function motivoRechazoWhatsapp(detalle: ErrorWhatsapp["detalle"]) {
  const code = Number(detalle?.code);
  if (code === 131047 || /24 hours|re-engagement/i.test(detalle?.message || "")) {
    return "WhatsApp solo deja responder hasta 24 horas después del último mensaje del cliente, y ese plazo ya pasó. Para escribirle de nuevo hace falta una plantilla aprobada por Meta; mientras tanto, llámalo desde su ficha.";
  }
  if (code === 131026) return "Ese número no puede recibir mensajes de WhatsApp. Contáctalo por teléfono.";
  if (code === 190 || code === 10 || code === 200) return "WhatsApp rechazó el envío por un permiso o el token. Avísale a Nicolás.";
  if (code === 131056 || code === 130429 || code === 80007) return "WhatsApp está recibiendo demasiados mensajes. Espera un par de minutos y vuelve a intentar.";
  return "WhatsApp no aceptó el mensaje. Intenta de nuevo en un rato.";
}

/** Texto que se guarda para lo que no es texto (audio, foto…), igual que en IG/FB. */
export function describirMensajeWhatsapp(m: WhatsappMensaje): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body ?? null;
    case "button":
      return m.button?.text ?? null;
    case "interactive":
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || null;
    case "audio":
      return "[Audio]";
    case "image":
      return m.image?.caption ? `[Imagen] ${m.image.caption}` : "[Imagen]";
    case "video":
      return "[Video]";
    case "document":
      return "[Archivo]";
    case "sticker":
      return "[Sticker]";
    case "location":
      return "[Ubicación]";
    case "reaction":
      return null; // Una reacción no es un mensaje nuevo.
    default:
      return "[Mensaje]";
  }
}

/** Lo que llega en value.messages[] del webhook (solo lo que usamos). */
export interface WhatsappMensaje {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  audio?: { id?: string; mime_type?: string };
  /** Si llegó desde un anuncio de clic a WhatsApp. */
  referral?: { source_url?: string; source_id?: string; source_type?: string; headline?: string; body?: string; ctwa_clid?: string };
}
