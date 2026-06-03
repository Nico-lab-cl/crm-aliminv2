import { NextResponse } from 'next/server';
import { syncEvolutionChats } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[Sync All Webhook] Starting historical sync for last 180 days...');
    const result = await syncEvolutionChats(undefined, 4320); // 180 days
    console.log(`[Sync All Webhook] Sync complete. Synced messages: ${result.syncedCount}`);
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización histórica completada con éxito.',
      syncedCount: result.syncedCount
    });
  } catch (error: any) {
    console.error('[Sync All Webhook] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
