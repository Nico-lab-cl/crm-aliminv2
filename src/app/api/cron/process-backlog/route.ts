import { NextResponse } from "next/server";
import { runProcessBacklog } from "@/lib/cronJobs";

export const dynamic = "force-dynamic";

/**
 * Cron Job: Processes unassigned leads (the backlog) one by one.
 * NO corre sola: src/instrumentation.ts sincroniza los leads web y las visitas
 * cada 2 minutos, pero no reparte el backlog (repartiria leads viejos, cada uno
 * con su aviso). Esta ruta queda para disparo manual.
 */
export async function GET() {
  try {
    const result = await runProcessBacklog();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in process-backlog cron:", error);
    return NextResponse.json({
      error: "Internal Server Error",
      details: error.message,
    }, { status: 500 });
  }
}
