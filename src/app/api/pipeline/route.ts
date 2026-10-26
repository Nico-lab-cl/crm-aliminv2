import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ASESORES_ACTIVOS, FECHA_MINIMA, hoyEnChile, leerTablero, rangoDe } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * Tablero del pipeline. Cada asesor ve solo sus leads; el administrador ve a
 * Marcela, Orlando y Bárbara, o a uno de ellos con ?asesor=<id>.
 * Fechas: ?dias=N (por defecto 30) o ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD,
 * nunca antes de FECHA_MINIMA.
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const { desde, hasta } = rangoDe(url.searchParams);
  const esAdmin = session.user.role === "ADMIN";
  const pedido = url.searchParams.get("asesor") || "";
  const asesores = !esAdmin ? [session.user.id] : ASESORES_ACTIVOS.includes(pedido) ? [pedido] : ASESORES_ACTIVOS;

  try {
    const [tablero, nombres] = await Promise.all([
      leerTablero(asesores, desde, hasta),
      esAdmin
        ? (prisma as any).user.findMany({
            where: { id: { in: ASESORES_ACTIVOS } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({ ...tablero, desde, hasta, fechaMinima: FECHA_MINIMA, hoy: hoyEnChile(), asesores: nombres });
  } catch (error) {
    console.error("Error in GET /api/pipeline:", error);
    return NextResponse.json({ error: "No se pudo leer el pipeline" }, { status: 500 });
  }
}
