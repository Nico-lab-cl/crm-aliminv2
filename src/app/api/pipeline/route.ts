import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { leerPipeline } from "@/lib/pipeline";
import { ETAPAS } from "@/lib/pipelineEtapas";

export const dynamic = "force-dynamic";

const PESTANAS = ["HOY", "SIN_ACCION", ...ETAPAS.map((e) => e.id)];

/**
 * Pipeline del asesor. Cada asesor ve solo sus leads; el administrador ve
 * todos o los de un asesor con ?asesor=<id>. ?pestana= elige la lista.
 */
export async function GET(req: Request) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pedida = (url.searchParams.get("pestana") || "HOY").toUpperCase();
  const pestana = PESTANAS.includes(pedida) ? pedida : "HOY";
  const asesorId = session.user.role === "ADMIN" ? url.searchParams.get("asesor") || null : session.user.id;

  try {
    return NextResponse.json(await leerPipeline(asesorId, pestana));
  } catch (error) {
    console.error("Error in GET /api/pipeline:", error);
    return NextResponse.json({ error: "No se pudo leer el pipeline" }, { status: 500 });
  }
}
