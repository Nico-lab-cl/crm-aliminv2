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

/** Descarga el audio y devuelve lo que dice, o null si no se pudo. */
export async function transcribirAudio(url: string): Promise<string | null> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return null;
  try {
    const audio = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!audio.ok) throw new Error(`descarga ${audio.status}`);
    const tipo = (audio.headers.get("content-type") || "audio/mp4").split(";")[0].trim().toLowerCase();
    const buf = await audio.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_BYTES) throw new Error(`tamaño ${buf.byteLength}`);

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
