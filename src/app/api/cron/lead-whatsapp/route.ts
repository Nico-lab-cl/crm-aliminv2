import { NextResponse } from "next/server";
import { runAvisosWhatsappLeads } from "@/lib/avisosWhatsappLeads";
import { probarResumen, runResumenesWhatsapp } from "@/lib/resumenesWhatsapp";
import { probarResumenScore } from "@/lib/avisosLeadScore";
import { probarPresupuesto } from "@/lib/presupuestoMeta";

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
 *
 * ?probar=diario o ?probar=semanal manda ese resumen ahora, marcado como
 * prueba. Como publica en el grupo, siempre exige clave: CRON_SECRET, o si no
 * existe, el token de Evolution (EVOLUTION_API_KEY). Con &para=569XXXXXXXX
 * va a ese numero en vez del grupo; con &vista=1 no manda nada y devuelve el
 * texto.
 *
 * ?probar=presupuesto arma el analisis del presupuesto de Meta con la ultima
 * semana terminada, o con &desde=AAAA-MM-DD&hasta=AAAA-MM-DD. Con &vista=1 solo
 * devuelve el texto; si no, va a &para= (numero o grupo) o al grupo MKT.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const probar = url.searchParams.get("probar");

  if (probar === "diario" || probar === "semanal" || probar === "score" || probar === "score-vista" || probar === "presupuesto") {
    const esperada = process.env.CRON_SECRET || process.env.EVOLUTION_API_KEY;
    const recibida =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");
    if (!esperada || recibida !== esperada) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    try {
      // score-vista devuelve el texto del resumen del lead score sin mandarlo;
      // score lo publica en el grupo marcado como PRUEBA.
      if (probar === "score-vista") return NextResponse.json(await probarResumenScore("vista"));
      if (probar === "score") return NextResponse.json(await probarResumenScore("enviar"));
      const soloVista = url.searchParams.get("vista") === "1";
      if (probar === "presupuesto") {
        // para acepta un numero o un grupo (@g.us); lo valida probarPresupuesto.
        return NextResponse.json(
          await probarPresupuesto({
            para: url.searchParams.get("para") || undefined,
            soloVista,
            desde: url.searchParams.get("desde") || undefined,
            hasta: url.searchParams.get("hasta") || undefined,
          })
        );
      }
      const para = (url.searchParams.get("para") || "").replace(/\D/g, "");
      if (para && (para.length < 8 || para.length > 15)) {
        return NextResponse.json({ error: "El numero de 'para' no es valido" }, { status: 400 });
      }
      return NextResponse.json(
        await probarResumen(probar, { para: para || undefined, soloVista })
      );
    } catch (error: any) {
      console.error("[cron/lead-whatsapp] Fallo la prueba:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

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
