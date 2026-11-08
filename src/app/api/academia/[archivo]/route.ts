import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CAPSULAS } from "@/lib/academia";

export const dynamic = "force-dynamic";

/**
 * Sirve los videos y portadas de la Academia solo a quien inició sesión: las
 * cápsulas muestran nombres y teléfonos de clientes reales, por eso no van en
 * `public/`. Responde pedidos por rangos (206) para que el video se pueda
 * adelantar y empiece a reproducirse sin bajar el archivo entero.
 */
const TIPOS: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg" };
const PERMITIDOS = new Set(CAPSULAS.flatMap((c) => [`${c.slug}.mp4`, `${c.slug}.jpg`]));
const CARPETA = path.join(process.cwd(), "academia");

function aWebStream(nodo: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodo.on("data", (trozo) => controller.enqueue(new Uint8Array(trozo as Buffer)));
      nodo.on("end", () => controller.close());
      nodo.on("error", (e) => controller.error(e));
    },
    cancel() {
      nodo.destroy();
    },
  });
}

export async function GET(req: Request, { params }: { params: { archivo: string } }) {
  const session = await getServerSession(authOptions as any);
  if (!session) return new Response("No autorizado", { status: 401 });

  const archivo = params.archivo;
  if (!PERMITIDOS.has(archivo)) return new Response("No encontrado", { status: 404 });

  const ruta = path.join(CARPETA, archivo);
  let tamano: number;
  try {
    tamano = fs.statSync(ruta).size;
  } catch {
    return new Response("No encontrado", { status: 404 });
  }

  const tipo = TIPOS[path.extname(archivo)] || "application/octet-stream";
  const base = {
    "Content-Type": tipo,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
  };

  const rango = req.headers.get("range");
  const m = rango?.match(/bytes=(\d*)-(\d*)/);
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(aWebStream(fs.createReadStream(ruta)), {
      status: 200,
      headers: { ...base, "Content-Length": String(tamano) },
    });
  }

  // "bytes=-N" pide los últimos N bytes.
  const inicio = m[1] === "" ? Math.max(tamano - Number(m[2]), 0) : Number(m[1]);
  let fin = m[1] !== "" && m[2] !== "" ? Number(m[2]) : tamano - 1;
  fin = Math.min(fin, tamano - 1);
  if (inicio > fin || inicio >= tamano) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${tamano}` } });
  }

  return new Response(aWebStream(fs.createReadStream(ruta, { start: inicio, end: fin })), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(fin - inicio + 1),
      "Content-Range": `bytes ${inicio}-${fin}/${tamano}`,
    },
  });
}
