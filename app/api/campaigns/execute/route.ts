import { NextResponse } from 'next/server';
import { startBatchExecution, getTodaySentCount } from '@/lib/batch_engine';

export async function GET() {
  // Return daily quota info
  try {
    const sentToday = await getTodaySentCount();
    const dailyLimit = 2000;
    return NextResponse.json({
      sentToday,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - sentToday),
    });
  } catch {
    return NextResponse.json({ sentToday: 0, dailyLimit: 2000, remaining: 2000 });
  }
}

export async function POST(request: Request) {
  try {
    const { campaignId, filters, advancedFilters, dateRange, batchSize, delayMs } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ message: 'campaignId es requerido' }, { status: 400 });
    }

    // Start batch job in background — returns immediately
    const result = await startBatchExecution({ 
      campaignId, 
      leadFilters: filters,
      advancedFilters,
      dateRange,
      batchSize: batchSize || 50,
      delayMs: delayMs || 5000,
    });

    return NextResponse.json({ 
      message: result.willSend < result.totalLeads 
        ? `Enviando ${result.willSend} de ${result.totalLeads} leads (límite diario: ${result.dailyRemaining} restantes)`
        : `Envío masivo iniciado: ${result.totalLeads} leads en lotes de ${batchSize || 50}`,
      jobId: result.jobId,
      totalLeads: result.totalLeads,
      willSend: result.willSend,
      dailyUsed: result.dailyUsed,
      dailyRemaining: result.dailyRemaining,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar campaña';
    console.error('Error al ejecutar campaña:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
