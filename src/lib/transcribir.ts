import prisma from "./prisma";

/**
 * Audios de Instagram y Facebook a texto (17-11-2026), para que Ali los
 * entienda y el asesor los lea en la bandeja sin escucharlos.
 *
 * Usa la API de OpenAI (gpt-4o-mini-transcribe, ~US$0,003 por minuto).
 * Variables (EasyPanel → CRM móvil → Entorno):
 *   OPENAI_API_KEY            sin ella no se transcribe y todo sigue como antes
 *                             (el audio queda como "[Audio]" y Ali pide que lo escriban).
 *   OPENAI_TRANSCRIBE_MODEL   opcional, por defecto gpt-4o-mini-transcribe.
 *   TRANSCRIBIR_AUDIOS=false  apaga la transcripción sin borrar la clave.
 *
 * El mensaje queda como "🎤 (audio) <lo que dijo>"; el audio original sigue en
 * mediaUrl. Nunca lanza: si algo falla, el mensaje queda como "[Audio]".
 */

const MAX_BYTES = 25 * 1024 * 1024; // límite de la API de OpenAI
const PREFIJO = "🎤 (audio)";

/** Palabras que el modelo debe escribir bien (nombres propios del negocio). */
const VOCABULARIO =
  "Conversación de un cliente con Alimin, inmobiliaria chilena. Proyectos Lomas del Mar y Arena y Sol, en El Tabo y el litoral central. Terrenos, lotes, pie, cuotas, crédito directo, contado, rol propio, escritura, visita.";

export function transcripcionActiva() {
  return Boolean(process.env.OPENAI_API_KEY) && (process.env.TRANSCRIBIR_AUDIOS || "").trim().toLowerCase() !== "false";
}

const EXTENSION: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "video/mp4": "mp4",
};

export const PREFIJO_AUDIO = PREFIJO;

/** Descarga el audio (con cabeceras si la URL las pide) y devuelve lo que dice, o null. */
export async function transcribirAudio(url: string, cabeceras?: Record<string, string>): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const audio = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(20000) });
    if (!audio.ok) throw new Error(`descarga ${audio.status}`);
    const tipo = (audio.headers.get("content-type") || "audio/mp4").split(";")[0].trim().toLowerCase();
    return await transcribirBytes(await audio.arrayBuffer(), tipo);
  } catch (error) {
    console.error("[transcribir] No se pudo descargar el audio:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Transcribe un audio que ya está en memoria (chat web, chat de prueba de
 * Ali): devuelve lo que dice, o null si no se pudo. Nunca lanza.
 */
export async function transcribirBytes(datos: ArrayBuffer | Uint8Array, tipoCrudo: string): Promise<string | null> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return null;
  try {
    // Copia a un ArrayBuffer propio: Blob no acepta vistas sobre SharedArrayBuffer.
    const buf = new Uint8Array(datos instanceof Uint8Array ? datos : new Uint8Array(datos));
    if (!buf.byteLength || buf.byteLength > MAX_BYTES) throw new Error(`tamaño ${buf.byteLength}`);
    const tipo = (tipoCrudo || "audio/mp4").split(";")[0].trim().toLowerCase();

    const form = new FormData();
    form.append("file", new Blob([buf], { type: tipo }), `audio.${EXTENSION[tipo] || "m4a"}`);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    form.append("language", "es");
    form.append("prompt", VOCABULARIO);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${clave}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const d = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${d.error?.message || "sin detalle"}`);
    const texto = (d.text || "").trim();
    return texto || null;
  } catch (error) {
    console.error("[transcribir] No se pudo transcribir el audio:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Transcribe el audio de un mensaje ya guardado (por su sourceId, el mid de
 * Meta) y deja el texto en el mensaje. Devuelve la transcripción o null.
 */
export async function transcribirMensaje(sourceId: string, url: string): Promise<string | null> {
  if (!transcripcionActiva()) return null;
  const texto = await transcribirAudio(url);
  if (!texto) return null;
  await (prisma as any).message.updateMany({
    where: { sourceId, text: "[Audio]" },
    data: { text: `${PREFIJO} ${texto}`.slice(0, 4000) },
  });
  console.log(`[transcribir] Audio ${sourceId} transcrito (${texto.length} caracteres).`);
  return texto;
}

/**
 * Audio de WhatsApp (Cloud API): primero se pide la URL del archivo con su id
 * y después se descarga con el mismo token. Deja el texto en el mensaje.
 */
export async function transcribirAudioWhatsapp(wamid: string, mediaId: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!transcripcionActiva() || !token) return null;
  try {
    const version = process.env.WHATSAPP_API_VERSION || "v25.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const d = (await res.json().catch(() => ({}))) as { url?: string };
    if (!res.ok || !d.url) throw new Error(`media ${res.status}`);
    const texto = await transcribirAudio(d.url, { authorization: `Bearer ${token}` });
    if (!texto) return null;
    await (prisma as any).message.updateMany({
      where: { sourceId: wamid, text: "[Audio]" },
      data: { text: `${PREFIJO} ${texto}`.slice(0, 4000) },
    });
    console.log(`[transcribir] Audio de WhatsApp ${wamid} transcrito (${texto.length} caracteres).`);
    return texto;
  } catch (error) {
    console.error("[transcribir] No se pudo transcribir el audio de WhatsApp:", error instanceof Error ? error.message : error);
    return null;
  }
}
