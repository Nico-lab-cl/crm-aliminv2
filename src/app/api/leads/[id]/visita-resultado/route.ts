import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ErrorPipeline } from "@/lib/pipeline";
import { estadoDeVisita, marcarVisita } from "@/lib/visitaRealizada";

export const dynamic = "force-dynamic";

/** Estado de la última visita del lead: agendada, por marcar, llegó o no llegó. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await estadoDeVisita(params.id));
  } catch (error) {
    console.error("[visita-resultado] Error leyendo el estado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** El asesor marca si el cliente llegó: { llego: true | false }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body?.llego !== "boolean") return NextResponse.json({ error: "Falta llego" }, { status: 400 });
  try {
    const usuario = { id: session.user.id as string, role: session.user.role as string | undefined };
    return NextResponse.json(await marcarVisita(params.id, usuario, body.llego));
  } catch (error) {
    if (error instanceof ErrorPipeline) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[visita-resultado] Error marcando la visita:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
