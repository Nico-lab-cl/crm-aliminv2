import { NextResponse } from "next/server";
import { runLeadFollowups } from "@/lib/followups";

export const dynamic = "force-dynamic";

/**
 * Pasada manual de los recordatorios de leads sin contactar.
 *
 * En condiciones normales esto no hace falta: el temporizador de
 * src/instrumentation.ts corre la misma funcion cada minuto dentro del propio
 * proceso del CRM. La ruta queda para tres cosas: verificar a mano que el
 * circuito funciona, disparar una pasada despues de un despliegue, y permitir
 * que un agendador externo (n8n o el crontab del VPS) se haga cargo si algun
 * dia se prefiere ese camino.
 *
 * Es segura de llamar cuantas veces se quiera: runLeadFollowups avanza el
 * contador de cada lead condicionado a su valor anterior, asi que dos llamadas
 * seguidas no mandan el mismo aviso dos veces.
 *
 * Si existe CRON_SECRET, se exige. Sin esa variable la ruta queda abierta, que
 * es como estan hoy las otras dos rutas de cron del CRM.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;

  if (secreto) {
    const url = new URL(req.url);
    const recibido =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");

    if (recibido !== secreto) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  try {
    const resultado = await runLeadFollowups();
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("[cron/lead-followups] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
