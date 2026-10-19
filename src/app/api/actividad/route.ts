import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { leerActividad } from "@/lib/actividad";

export const dynamic = "force-dynamic";

/**
 * Menú Actividad. Cada asesor ve solo sus leads; el administrador, todos.
 * ?banda=CALIENTE|TIBIO|TEMPLADO|FRIO elige la pestaña (por defecto CALIENTE).
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banda = (new URL(req.url).searchParams.get("banda") || "CALIENTE").toUpperCase().replace(/[^A-Z_]/g, "");
  const asesorId = session.user.role === "ADMIN" ? null : session.user.id;

  try {
    return NextResponse.json(await leerActividad(asesorId, banda));
  } catch (error) {
    console.error("Error in GET /api/actividad:", error);
    return NextResponse.json({ error: "No se pudo leer la actividad" }, { status: 500 });
  }
}
