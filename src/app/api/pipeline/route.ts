import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ASESORES_ACTIVOS, leerTablero } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

/**
 * Tablero del pipeline. Cada asesor ve solo sus leads; el administrador ve a
 * Marcela, Orlando y Bárbara, o a uno de ellos con ?asesor=<id>.
 * ?dias=7|30|90 elige el período (por defecto 30).
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pedidos = Number(url.searchParams.get("dias"));
  const dias = PERIODOS.includes(pedidos) ? pedidos : 30;
  const esAdmin = session.user.role === "ADMIN";
  const pedido = url.searchParams.get("asesor") || "";
  const asesores = !esAdmin ? [session.user.id] : ASESORES_ACTIVOS.includes(pedido) ? [pedido] : ASESORES_ACTIVOS;

  try {
    const [tablero, nombres] = await Promise.all([
      leerTablero(asesores, dias),
      esAdmin
        ? (prisma as any).user.findMany({
            where: { id: { in: ASESORES_ACTIVOS } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({ ...tablero, dias, asesores: nombres });
  } catch (error) {
    console.error("Error in GET /api/pipeline:", error);
    return NextResponse.json({ error: "No se pudo leer el pipeline" }, { status: 500 });
  }
}
