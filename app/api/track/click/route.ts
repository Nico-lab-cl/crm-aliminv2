import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const log_id = searchParams.get('log_id');
  const destinationUrl = searchParams.get('url');
  let leadId: string | null = null;

  if (log_id) {
    try {
      // Registrar click en la base de datos y obtener detalles
      const res = await queryMarketing(
        `UPDATE campaign_logs 
         SET clicks = COALESCE(clicks, 0) + 1, 
             last_clicked_at = CURRENT_TIMESTAMP 
         WHERE id = $1
         RETURNING lead_id, email, campaign_id`,
        [log_id]
      );
      if (res.rows && res.rows.length > 0) {
        const { lead_id: returnedLeadId, email, campaign_id } = res.rows[0];
        leadId = returnedLeadId;

        // Registrar notificación de clic
        try {
          const campaignRes = await queryMarketing('SELECT title FROM campaigns WHERE id = $1', [campaign_id]);
          const campaignTitle = campaignRes.rows[0]?.title || 'Campaña sin título';

          let name = '';
          if (leadId) {
            const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [leadId]);
            if (leadRes.rows.length > 0) {
              const row = leadRes.rows[0];
              const first = row.FirstName || row.firstname || row.first_name || '';
              const last = row.LastName || row.lastname || row.last_name || '';
              name = `${first} ${last}`.trim();
            }
          }

          const displayName = name || email || 'Un contacto';
          const titleMsg = 'Enlace Clickeado';
          const messageMsg = `${displayName} hizo clic en un enlace de la campaña "${campaignTitle}" (${destinationUrl || ''})`;

          await queryMarketing(`
            INSERT INTO notifications (lead_id, email, event_type, title, message)
            VALUES ($1, $2, $3, $4, $5)
          `, [leadId, email, 'EMAIL_CLICKED', titleMsg, messageMsg]);
        } catch (err) {
          console.warn('Error fetching details or inserting notification for email click:', err);
        }
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
