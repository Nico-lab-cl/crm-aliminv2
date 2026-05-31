import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const log_id = searchParams.get('log_id');
  const destinationUrl = searchParams.get('url');
  let leadId: string | null = null;

  if (log_id) {
    try {
      // Registrar click en la base de datos y obtener lead_id
      const res = await queryMarketing(
        `UPDATE campaign_logs 
         SET clicks = COALESCE(clicks, 0) + 1, 
             last_clicked_at = CURRENT_TIMESTAMP 
         WHERE id = $1
         RETURNING lead_id`,
        [log_id]
      );
      if (res.rows && res.rows.length > 0) {
        leadId = res.rows[0].lead_id;
      }
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  }

  // Redirigir siempre al destino final, incluso si falla el registro en la base de datos
  const fallbackUrl = 'https://aliminspa.cl';
  let redirectUrl = destinationUrl || fallbackUrl;

  if (leadId) {
    try {
      const parsedUrl = new URL(redirectUrl);
      parsedUrl.searchParams.set('lead_id', leadId);
      redirectUrl = parsedUrl.toString();
    } catch {
      // Si la URL es relativa (ej: /lotes)
      const separator = redirectUrl.includes('?') ? '&' : '?';
      redirectUrl = `${redirectUrl}${separator}lead_id=${leadId}`;
    }
  }

  return NextResponse.redirect(redirectUrl);
}
