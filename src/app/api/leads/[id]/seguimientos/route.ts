import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ErrorPipeline, leadDelUsuario, leerHistorial, registrarSeguimiento } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/** Historial del lead: cambios de etapa y seguimientos. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    await leadDelUsuario(params.id, session.user);
    return NextResponse.json(await leerHistorial(params.id));
  } catch (error) {
    if (error instanceof ErrorPipeline) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[leads/seguimientos] Error leyendo el historial:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** El asesor anota un contacto con el cliente (llamada, WhatsApp, visita…). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await registrarSeguimiento(params.id, session.user, body));
  } catch (error) {
    if (error instanceof ErrorPipeline) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[leads/seguimientos] Error registrando el seguimiento:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
