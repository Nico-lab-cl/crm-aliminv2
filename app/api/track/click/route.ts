import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const log_id = searchParams.get('log_id');
  const destinationUrl = searchParams.get('url');

  if (log_id) {
    try {
      // Registrar click en la base de datos (incrementar contador y guardar fecha)
      await queryMarketing(
        `UPDATE campaign_logs 
         SET clicks = COALESCE(clicks, 0) + 1, 
             last_clicked_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [log_id]
      );
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }

  // Redirigir siempre al destino final, incluso si falla el registro en la base de datos
  const fallbackUrl = 'https://aliminspa.cl';
  const redirectUrl = destinationUrl || fallbackUrl;

  return NextResponse.redirect(redirectUrl);
}
