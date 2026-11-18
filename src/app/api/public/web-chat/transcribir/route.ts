import { NextResponse } from "next/server";
import { checkWebChatKey, rateLimit } from "@/lib/web-chat";
import { ErrorDeAdjunto, validarAdjunto } from "@/lib/media";
import { transcribirBytes, transcripcionActiva } from "@/lib/transcribir";

export const dynamic = "force-dynamic";

/**
 * Transcribe un audio para el sitio (19-11-2026): lo usa el chat de prueba de
 * Ali (aliminspa.cl/probar-ali), que no guarda nada en el CRM. La clave de
 * OpenAI vive solo aquí; el sitio llama con la API key del chat web y el
 * navegador del visitante nunca habla directo con el CRM. No guarda el audio.
 */
export async function POST(req: Request) {
  const unauthorized = checkWebChatKey(req);
  if (unauthorized) return unauthorized;
  if (!transcripcionActiva()) {
    return NextResponse.json({ error: "La transcripción de audios no está activa" }, { status: 503 });
  }
  if (!rateLimit("transcribir", 40, 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados audios seguidos, espera unos segundos." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "El envio no es un formulario valido" }, { status: 400 });
  }

  try {
    const adjunto = await validarAdjunto(form.get("file"));
    if (adjunto.kind !== "audio") {
      return NextResponse.json({ error: "Solo se transcriben audios" }, { status: 400 });
    }
    const texto = await transcribirBytes(adjunto.bytes, adjunto.mimeType);
    if (!texto) return NextResponse.json({ error: "No se pudo entender el audio" }, { status: 422 });
    return NextResponse.json({ texto });
  } catch (error) {
    if (error instanceof ErrorDeAdjunto) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[transcribir] Error transcribiendo para el sitio:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
