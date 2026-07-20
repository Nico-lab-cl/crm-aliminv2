import { NextResponse } from "next/server";
import { runVisitReminders } from "@/lib/cronJobs";

export const dynamic = "force-dynamic";

/**
 * Ahora tambien se dispara solo desde src/instrumentation.ts; esta ruta
 * queda disponible para disparo manual/verificacion.
 */
export async function GET() {
  try {
    const result = await runVisitReminders();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Cron Reminder Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
