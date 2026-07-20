import { NextResponse } from "next/server";
import { runProcessBacklog } from "@/lib/cronJobs";

export const dynamic = "force-dynamic";

/**
 * Cron Job: Processes unassigned leads (the backlog) one by one.
 * Ahora tambien se dispara solo desde src/instrumentation.ts; esta ruta
 * queda disponible para disparo manual/verificacion.
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
