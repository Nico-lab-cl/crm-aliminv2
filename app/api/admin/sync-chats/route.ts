import { NextResponse } from 'next/server';
import { syncEvolutionChats } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    let hours = 720; // 30 días por defecto
    
    try {
      const body = await request.json();
      if (body.hours && typeof body.hours === 'number') {
        hours = body.hours;
      }
    } catch {
      // Ignorar si no hay body JSON, usar el valor por defecto
    }

    console.log(`[Admin WhatsApp Sync] Iniciando sincronización masiva de los últimos ${hours} horas...`);
    const result = await syncEvolutionChats(undefined, hours);
    console.log(`[Admin WhatsApp Sync] Sincronización finalizada. Nuevos mensajes: ${result.syncedCount}`);

    return NextResponse.json({
      success: true,
      message: `Sincronización masiva de WhatsApp completada con éxito.`,
      syncedCount: result.syncedCount,
      rangeHours: hours
    });

  } catch (error) {
    console.error('Error in POST /api/admin/sync-chats:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno en la sincronización masiva', error: (error as Error).message },
      { status: 500 }
    );
  }
}
