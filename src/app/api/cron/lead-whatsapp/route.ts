import { NextResponse } from "next/server";
import { runAvisosWhatsappLeads } from "@/lib/avisosWhatsappLeads";
import { runResumenesWhatsapp } from "@/lib/resumenesWhatsapp";

export const dynamic = "force-dynamic";

/**
 * Pasada manual de los avisos de leads al grupo de WhatsApp.
 *
 * Igual que /api/cron/lead-followups: en condiciones normales no hace falta,
 * porque src/instrumentation.ts corre la misma funcion cada minuto. Sirve para
 * probar el circuito a mano despues de configurar las variables.
 *
 * Es segura de llamar cuantas veces se quiera: cada aviso se reclama en
 * whatsapp_lead_avisos antes de enviarse, y la clave unica (lead_id, evento)
 * impide mandarlo dos veces.
 *
 * Si existe CRON_SECRET, se exige.
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
    const resultado = await runAvisosWhatsappLeads();
    const resumenes = await runResumenesWhatsapp();
    return NextResponse.json({ ...resultado, resumenes: resumenes.enviados });
  } catch (error: any) {
    console.error("[cron/lead-whatsapp] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
