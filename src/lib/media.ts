import prisma from "./prisma";

/**
 * Adjuntos del chat: imagen, audio y video.
 *
 * Los archivos se guardan en la propia base del CRM, en la tabla MessageMedia
 * (columna BYTEA), y se sirven por /api/media/[id]. No hay bucket ni disco de
 * por medio, asi que un respaldo de la base se lleva tambien los adjuntos.
 *
 * A cambio hay dos reglas que este archivo hace cumplir y que no se pueden
 * relajar sin degradar la bandeja:
 *
 *   1. El binario NUNCA se lee en una consulta de listado. Solo lo lee
 *      /api/media/[id], de a un archivo por vez.
 *   2. Los limites de tamaño de abajo son el unico freno al crecimiento de la
 *      base. Subirlos es una decision de infraestructura, no de interfaz.
 */

export type TipoAdjunto = "image" | "audio" | "video";

/**
 * Tipos aceptados y su limite de tamaño.
 *
 * El audio grabado en el navegador sale como WEBM/Opus en Android y Chrome, y
 * como MP4/AAC en Safari e iOS; por eso estan los dos. El limite de 12 MB deja
 * holgura para unos 10 minutos de voz en Opus, muy por encima de lo que un
 * asesor manda en la practica.
 */
const TIPOS_PERMITIDOS: Record<string, { kind: TipoAdjunto; maxBytes: number }> = {
  "image/jpeg": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/png": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/heic": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "image/heif": { kind: "image", maxBytes: 8 * 1024 * 1024 },
  "audio/webm": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "audio/ogg": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "audio/mpeg": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "audio/mp4": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "audio/aac": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "audio/x-m4a": { kind: "audio", maxBytes: 12 * 1024 * 1024 },
  "video/mp4": { kind: "video", maxBytes: 25 * 1024 * 1024 },
  "video/webm": { kind: "video", maxBytes: 25 * 1024 * 1024 },
  "video/quicktime": { kind: "video", maxBytes: 25 * 1024 * 1024 },
};

/** El tipo declarado por el cliente es una pista, no una prueba. */
export const MAX_BYTES_ABSOLUTO = 25 * 1024 * 1024;

/**
 * Firmas binarias de los formatos aceptados.
 *
 * El navegador (y cualquiera que llame al endpoint publico a mano) puede
 * declarar el Content-Type que quiera. Antes de guardar nada se leen los
 * primeros bytes del archivo y se confirma que sea de verdad lo que dice ser,
 * para que nadie use el chat como alojamiento de archivos arbitrarios.
 */
function detectarTipoReal(buf: Buffer): TipoAdjunto | null {
  if (buf.length < 12) return null;

  const hex = buf.subarray(0, 12).toString("hex");
  const ascii = (desde: number, largo: number) =>
    buf.subarray(desde, desde + largo).toString("ascii");

  // Imagenes
  if (hex.startsWith("ffd8ff")) return "image"; // JPEG
  if (hex.startsWith("89504e470d0a1a0a")) return "image"; // PNG
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image"; // WEBP

  // Contenedores ISO-BMFF: MP4, M4A, MOV, HEIC. Todos empiezan con "ftyp" en
  // el byte 4 y se distinguen por la marca de formato que viene despues.
  if (ascii(4, 4) === "ftyp") {
    const marca = ascii(8, 4);
    if (marca === "heic" || marca === "heix" || marca === "mif1" || marca === "heim") {
      return "image";
    }
    if (marca === "M4A " || marca === "M4B ") return "audio";
    return "video"; // isom, mp42, qt, avc1...
  }

  // WEBM y OGG sirven para audio y para video: el contenedor es el mismo. Aca
  // se acepta el archivo y se respeta el tipo declarado para elegir el
  // reproductor, porque a esta altura ya se sabe que el binario es legitimo.
  if (hex.startsWith("1a45dfa3")) return null; // Matroska/WEBM: lo resuelve el declarado
  if (ascii(0, 4) === "OggS") return null; // OGG: idem

  return null;
}

const CONTENEDORES_AMBIGUOS = new Set(["audio/webm", "video/webm", "audio/ogg"]);

function esContenedorAmbiguo(buf: Buffer) {
  if (buf.length < 4) return false;
  const hex = buf.subarray(0, 4).toString("hex");
  return hex === "1a45dfa3" || buf.subarray(0, 4).toString("ascii") === "OggS";
}

export type AdjuntoValidado = {
  kind: TipoAdjunto;
  mimeType: string;
  bytes: Buffer;
  sizeBytes: number;
};

export class ErrorDeAdjunto extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * Valida un archivo recibido en un formulario multipart y lo deja listo para
 * guardar. Lanza ErrorDeAdjunto con el mensaje que se le puede mostrar al
 * usuario tal cual.
 */
export async function validarAdjunto(file: unknown): Promise<AdjuntoValidado> {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    throw new ErrorDeAdjunto("No llego ningun archivo");
  }

  const archivo = file as File;
  const mimeType = (archivo.type || "").toLowerCase().split(";")[0].trim();
  const permitido = TIPOS_PERMITIDOS[mimeType];

  if (!permitido) {
    throw new ErrorDeAdjunto(
      "Ese tipo de archivo no se puede enviar por el chat. Se aceptan fotos, audios y videos."
    );
  }

  // El tamaño se revisa antes de leer el archivo a memoria: sin esto, un envio
  // de 500 MB se carga entero al proceso antes de ser rechazado.
  if (archivo.size > permitido.maxBytes) {
    const mb = Math.round(permitido.maxBytes / (1024 * 1024));
    throw new ErrorDeAdjunto(`El archivo supera el limite de ${mb} MB`);
  }
  if (archivo.size === 0) {
    throw new ErrorDeAdjunto("El archivo llego vacio");
  }

  const bytes = Buffer.from(await archivo.arrayBuffer());

  // Segunda revision del tamaño, ahora sobre el contenido real: archivo.size lo
  // informa el cliente y se puede mentir.
  if (bytes.length > permitido.maxBytes) {
    const mb = Math.round(permitido.maxBytes / (1024 * 1024));
    throw new ErrorDeAdjunto(`El archivo supera el limite de ${mb} MB`);
  }

  const tipoReal = detectarTipoReal(bytes);

  if (tipoReal === null && !(esContenedorAmbiguo(bytes) && CONTENEDORES_AMBIGUOS.has(mimeType))) {
    throw new ErrorDeAdjunto("El archivo no parece una foto, un audio ni un video validos");
  }
  if (tipoReal !== null && tipoReal !== permitido.kind) {
    throw new ErrorDeAdjunto("El contenido del archivo no coincide con su formato declarado");
  }

  return {
    kind: permitido.kind,
    mimeType,
    bytes,
    sizeBytes: bytes.length,
  };
}

/** Texto que se guarda en Message.text cuando el mensaje es solo un adjunto. */
export function textoPorDefecto(kind: TipoAdjunto) {
  if (kind === "image") return "📷 Foto";
  if (kind === "audio") return "🎤 Mensaje de voz";
  return "🎥 Video";
}

/** La ruta por la que se sirve el archivo. Relativa: cada sitio la resuelve contra su propio origen. */
export function rutaDelAdjunto(mediaId: string) {
  return `/api/media/${mediaId}`;
}

/**
 * Crea el mensaje y su adjunto en una sola transaccion.
 *
 * Van juntos a proposito: un mensaje que dice "Foto" y no tiene foto es peor
 * que un envio fallido, porque el asesor cree que la mando.
 */
export async function crearMensajeConAdjunto({
  conversationId,
  adjunto,
  senderType,
  senderId,
  texto,
  durationMs,
  fileName,
}: {
  conversationId: string;
  adjunto: AdjuntoValidado;
  senderType: "advisor" | "visitor";
  senderId?: string | null;
  texto?: string | null;
  durationMs?: number | null;
  fileName?: string | null;
}) {
  const cuerpo = (texto || "").trim() || textoPorDefecto(adjunto.kind);

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId,
        text: cuerpo,
        senderId: senderId || null,
        senderType,
        sourceType: "DIRECT",
      },
      select: { id: true, createdAt: true },
    });

    const media = await (tx as any).messageMedia.create({
      data: {
        messageId: message.id,
        kind: adjunto.kind,
        mimeType: adjunto.mimeType,
        fileName: fileName ? fileName.slice(0, 200) : null,
        sizeBytes: adjunto.sizeBytes,
        durationMs: durationMs && durationMs > 0 ? Math.round(durationMs) : null,
        data: adjunto.bytes,
      },
      select: { id: true },
    });

    // mediaUrl queda apuntando al adjunto recien creado para que la bandeja
    // pueda pintar el mensaje sin una segunda consulta por cada burbuja.
    await tx.message.update({
      where: { id: message.id },
      data: { mediaUrl: rutaDelAdjunto(media.id) },
    });

    return {
      id: message.id,
      createdAt: message.createdAt,
      mediaId: media.id,
      mediaUrl: rutaDelAdjunto(media.id),
      kind: adjunto.kind,
      mimeType: adjunto.mimeType,
      text: cuerpo,
    };
  });
}
