import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { puedeVerConversacion } from "@/lib/ali";

export const dynamic = "force-dynamic";

/**
 * 👍/👎 de un asesor sobre una respuesta de Ali, desde el chat de la bandeja
 * (Nicolás, 22-11-2026: que los asesores vean el chat y retroalimenten a Ali).
 * Se guarda en el CRM web, en Agentes IA → Pruebas del equipo (marcado "Chat
 * real"), donde una corrección se convierte en regla. Firma con el nombre de
 * la sesión. Variables: CRM_WEB_URL e IA_SECRET (las mismas de memoriaLead.ts).
 *
 * GET ?conversationId=…  → { votos }
 * POST { conversationId, messageId, voto: "bien" | "mal" | null, correccion? }
 */

const base = () => (process.env.CRM_WEB_URL || "https://marketing.aliminspa.cl").replace(/\/+$/, "");

async function sesionConAcceso(conversationId: string) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!conversationId || !(await puedeVerConversacion(conversationId, session.user))) {
    return { error: NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 }) };
  }
  if (!process.env.IA_SECRET) {
    return { error: NextResponse.json({ error: "Falta IA_SECRET para calificar a Ali" }, { status: 503 }) };
  }
  return { usuario: session.user as { name?: string | null } };
}

export async function GET(req: Request) {
  const conversationId = new URL(req.url).searchParams.get("conversationId") || "";
  const acceso = await sesionConAcceso(conversationId);
  if ("error" in acceso) return acceso.error;
  try {
    const res = await fetch(`${base()}/api/webhooks/ia/calificar-chat?conversationId=${encodeURIComponent(conversationId)}`, {
      headers: { "x-ia-secret": process.env.IA_SECRET as string },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({ votos: {} })), { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ votos: {} }, { status: 502 });
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const conversationId = String(body.conversationId || "").trim();
  const acceso = await sesionConAcceso(conversationId);
  if ("error" in acceso) return acceso.error;
  try {
    const res = await fetch(`${base()}/api/webhooks/ia/calificar-chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ia-secret": process.env.IA_SECRET as string },
      body: JSON.stringify({
        conversationId,
        messageId: String(body.messageId || ""),
        voto: body.voto === "bien" || body.voto === "mal" ? body.voto : null,
        correccion: typeof body.correccion === "string" ? body.correccion.slice(0, 2000) : null,
        asesor: acceso.usuario.name || "Asesor",
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const datos = await res.json().catch(() => ({}));
    return NextResponse.json(datos, { status: res.ok ? 200 : res.status === 400 ? 400 : 502 });
  } catch (error) {
    console.error("[calificar] El CRM web no respondió:", error);
    return NextResponse.json({ error: "No se pudo guardar la calificación. Intenta de nuevo." }, { status: 502 });
  }
}
