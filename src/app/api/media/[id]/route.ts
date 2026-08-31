import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { createHash, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Entrega un adjunto del chat (foto, audio o video).
 *
 * Es el unico lugar de todo el CRM que lee la columna binaria de MessageMedia.
 * Cualquier otra consulta debe traer solo los metadatos, o la bandeja empieza a
 * mover megabytes por cada listado.
 *
 * Aceptan dos formas de autorizacion:
 *
 *   - Sesion de NextAuth: es el caso del asesor, tanto en el APK como en el
 *     navegador.
 *   - Cabecera x-crm-api-key: es el caso del sitio publico aliminspa.cl y del
 *     CRM de escritorio, que piden el archivo desde su servidor para
 *     reenviarselo al visitante. Nunca se expone la URL cruda del CRM al
 *     visitante: si lo hicieramos, cualquiera con el id podria leer adjuntos de
 *     conversaciones ajenas.
 */

function claveDeServidorValida(req: Request) {
  const esperada = process.env.WEB_CHAT_API_KEY;
  if (!esperada) return false;

  const recibida = req.headers.get("x-crm-api-key");
  if (!recibida) return false;

  return timingSafeEqual(
    createHash("sha256").update(recibida).digest(),
    createHash("sha256").update(esperada).digest()
  );
}

/** Traduce el encabezado Range a un tramo concreto del archivo. */
function tramoPedido(rangeHeader: string | null, total: number) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, desdeRaw, hastaRaw] = match;

  // "bytes=-500" pide los ultimos 500 bytes.
  let desde = desdeRaw === "" ? total - Number(hastaRaw || 0) : Number(desdeRaw);
  let hasta = desdeRaw === "" ? total - 1 : hastaRaw === "" ? total - 1 : Number(hastaRaw);

  desde = Math.max(0, Math.min(desde, total - 1));
  hasta = Math.max(desde, Math.min(hasta, total - 1));

  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return null;

  return { desde, hasta };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let autorizado = claveDeServidorValida(req);

  if (!autorizado) {
    const session = (await getServerSession(authOptions as any)) as any;
    autorizado = Boolean(session?.user);
  }

  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const media = await (prisma as any).messageMedia.findUnique({
      where: { id: params.id },
      select: { mimeType: true, fileName: true, data: true, kind: true },
    });

    if (!media) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    const bytes: Buffer = Buffer.from(media.data);
    const total = bytes.length;

    // Los adjuntos son inmutables: una vez guardados nunca cambian, asi que el
    // navegador puede quedarselos para siempre. Es "private" porque son datos
    // de un cliente y no deben quedar en caches compartidas.
    const cabeceras: Record<string, string> = {
      "Content-Type": media.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline${
        media.fileName ? `; filename="${encodeURIComponent(media.fileName)}"` : ""
      }`,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };

    // Sin soporte de Range, adelantar un audio de voz no funciona en Chrome ni
    // en el WebView del APK: el reproductor pide un tramo y, si el servidor le
    // manda el archivo entero con 200, deshabilita la barra de avance.
    const tramo = tramoPedido(req.headers.get("range"), total);

    if (tramo) {
      const parte = bytes.subarray(tramo.desde, tramo.hasta + 1);
      return new NextResponse(parte as any, {
        status: 206,
        headers: {
          ...cabeceras,
          "Content-Range": `bytes ${tramo.desde}-${tramo.hasta}/${total}`,
          "Content-Length": String(parte.length),
        },
      });
    }

    return new NextResponse(bytes as any, {
      status: 200,
      headers: { ...cabeceras, "Content-Length": String(total) },
    });
  } catch (error) {
    console.error("[media] Error entregando el adjunto:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
