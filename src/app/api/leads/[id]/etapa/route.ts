import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ErrorPipeline, moverEtapa } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * El asesor mueve el lead de etapa. Exige próxima acción mientras el lead siga
 * abierto y motivo si se pierde; el historial lo anota el trigger de la base.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await moverEtapa(params.id, session.user, body));
  } catch (error) {
    if (error instanceof ErrorPipeline) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[leads/etapa] Error moviendo la etapa:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
