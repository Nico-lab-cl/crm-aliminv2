import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    // Verificar token opcional para seguridad básica
    const token = request.headers.get('x-callback-token');
    const expectedToken = process.env.N8N_CALLBACK_TOKEN;

    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    const { log_id, status } = await request.json();

    if (!log_id || !status) {
      return NextResponse.json({ message: 'log_id y status son requeridos' }, { status: 400 });
    }

    // Obtener información previa del log
    const logRes = await queryMarketing(
      `SELECT status, lead_id, email, campaign_id FROM campaign_logs WHERE id = $1`,
      [log_id]
    );

    if (logRes.rows.length === 0) {
      return NextResponse.json({ message: 'Log no encontrado' }, { status: 404 });
    }

    const { status: prevStatus, lead_id, email, campaign_id } = logRes.rows[0];

    // Actualizar el estado del log
    const query = `
      UPDATE campaign_logs 
      SET status = $1, last_callback_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `;
    await queryMarketing(query, [status, log_id]);

    // Registrar notificación si es un evento de interés y hay cambio de estado
    const relevantStatuses = ['OPENED', 'BOUNCED', 'REPLIED'];
    if (relevantStatuses.includes(status) && prevStatus !== status) {
      try {
        // Obtener detalles de la campaña
        const campaignRes = await queryMarketing('SELECT title FROM campaigns WHERE id = $1', [campaign_id]);
        const campaignTitle = campaignRes.rows[0]?.title || 'Campaña sin título';

        // Buscar nombre en MAIN_DB
        let name = '';
        if (lead_id) {
          const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [lead_id]);
          if (leadRes.rows.length > 0) {
            const row = leadRes.rows[0];
            const first = row.FirstName || row.firstname || row.first_name || '';
            const last = row.LastName || row.lastname || row.last_name || '';
            name = `${first} ${last}`.trim();
          }
        }

        const displayName = name || email || 'Un contacto';
        let eventType = '';
        let titleMsg = '';
        let messageMsg = '';

        if (status === 'OPENED') {
          eventType = 'EMAIL_OPENED';
          titleMsg = 'Correo Abierto';
          messageMsg = `${displayName} abrió el correo de la campaña "${campaignTitle}"`;
        } else if (status === 'BOUNCED') {
          eventType = 'EMAIL_BOUNCED';
          titleMsg = 'Correo Rebotado';
          messageMsg = `El correo de la campaña "${campaignTitle}" enviado a ${displayName} rebotó`;
        } else if (status === 'REPLIED') {
          eventType = 'EMAIL_REPLIED';
          titleMsg = 'Respuesta al Correo';
          messageMsg = `${displayName} respondió al correo de la campaña "${campaignTitle}"`;
        }

        if (eventType) {
          await queryMarketing(`
            INSERT INTO notifications (lead_id, email, event_type, title, message)
            VALUES ($1, $2, $3, $4, $5)
          `, [lead_id, email, eventType, titleMsg, messageMsg]);
        }
      } catch (err) {
        console.error('Error logging notification in n8n-callback webhook:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in n8n callback:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
