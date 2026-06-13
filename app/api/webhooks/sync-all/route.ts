import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener todos los JIDs distintos de mensajes donde el advisor_name de la DB es Marcela Escobar
    const distinctJidsRes = await queryMarketing(`
      SELECT remote_jid, COUNT(*) as message_count, MAX(timestamp) as last_msg
      FROM whatsapp_messages
      WHERE advisor_name = 'Marcela Escobar'
      GROUP BY remote_jid
      ORDER BY message_count DESC
    `);
    const jids = distinctJidsRes.rows;

    const results = [];

    // 2. Para los primeros 30 JIDs, investigar a qué leads corresponden y a quién están asignados
    for (const row of jids.slice(0, 30)) {
      const remoteJid = row.remote_jid;
      
      // Ver el último mensaje de este JID
      const lastMsgRes = await queryMarketing(`
        SELECT lead_id, advisor_name, body, from_me, timestamp, instance_id
        FROM whatsapp_messages
        WHERE remote_jid = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `, [remoteJid]);
      
      const lastMsg = lastMsgRes.rows[0];

      let leadInfo = null;
      if (lastMsg && lastMsg.lead_id) {
        const leadRes = await queryMain(`
          SELECT l.id, l."firstName", l."lastName", l.phone, l."assignedToId", u.name as assigned_advisor_name
          FROM "Lead" l
          LEFT JOIN "User" u ON l."assignedToId" = u.id
          WHERE l.id = $1
        `, [lastMsg.lead_id]);
        if (leadRes.rows.length > 0) {
          leadInfo = leadRes.rows[0];
        }
      }

      results.push({
        remote_jid: remoteJid,
        message_count: parseInt(row.message_count),
        last_msg_time: row.last_msg,
        db_message_advisor: lastMsg ? lastMsg.advisor_name : null,
        lead_id: lastMsg ? lastMsg.lead_id : null,
        lead_info: leadInfo
      });
    }

    // 3. También ver los primeros 10 mensajes generales de Marcela en la base de datos
    const sampleMsgs = await queryMarketing(`
      SELECT id, remote_jid, lead_id, from_me, body, timestamp, advisor_name, instance_id
      FROM whatsapp_messages
      WHERE advisor_name = 'Marcela Escobar'
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      total_distinct_jids: jids.length,
      distinct_jids_sample: results,
      sample_messages: sampleMsgs.rows
    });

  } catch (error: any) {
    console.error('[Sync All Webhook] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
