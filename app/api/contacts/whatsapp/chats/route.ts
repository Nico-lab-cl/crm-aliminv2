import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { syncEvolutionChats } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Verificar esquema y conexión (modo simulado)
    let dbConnected = false;
    try {
      const tableCheck = await queryMain(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      dbConnected = tableCheck.rows.length > 0;
    } catch {
      // offline/mock mode
    }

    if (!dbConnected) {
      // Retornar chats simulados para desarrollo local
      const mockChats = getMockChats();
      return NextResponse.json({
        success: true,
        chats: mockChats,
        isMock: true
      });
    }

    // 2. Intentar ejecutar una sincronización masiva rápida e incremental
    // antes de listar para asegurarnos de capturar chats nuevos en la bandeja de entrada
    try {
      const countRes = await queryMarketing('SELECT COUNT(*) FROM whatsapp_messages');
      const localCount = parseInt(countRes.rows[0].count || '0');

      if (localCount === 0) {
        console.log('[WhatsApp API Chats] Tabla local vacía. Realizando sincronización inicial de los últimos 180 días...');
        await syncEvolutionChats(undefined, 4320); // 180 días (6 meses)
      } else {
        console.log('[WhatsApp API Chats] Sincronizando chats incrementalmente...');
        await syncEvolutionChats(undefined, 24); // Sincroniza las últimas 24 horas en segundo plano
      }
    } catch (e) {
      console.warn('[WhatsApp API Chats] Error en la sincronización en segundo plano de Evolution API, mostrando datos offline:', (e as Error).message);
    }

    // 3. Consultar las conversaciones únicas más recientes
    const query = `
      SELECT DISTINCT ON (remote_jid) 
        id,
        message_id,
        lead_id,
        remote_jid,
        from_me,
        body,
        timestamp,
        instance_id,
        advisor_name
      FROM whatsapp_messages
      ORDER BY remote_jid, timestamp DESC
    `;

    const res = await queryMarketing(query);
    const rawChats = res.rows;

    // 4. Mapear nombres de Leads a los chats vinculados
    const chatsList = [];
    for (const chat of rawChats) {
      let leadName = null;
      let email = null;
      const phone = chat.remote_jid.split('@')[0].replace(/\D/g, '');

      if (chat.lead_id) {
        try {
          const leadRes = await queryMain(`
            SELECT "FirstName", "LastName", "Email" 
            FROM "Lead" 
            WHERE id = $1
          `, [chat.lead_id]);

          if (leadRes.rows.length > 0) {
            const first = leadRes.rows[0].FirstName || leadRes.rows[0].firstname || '';
            const last = leadRes.rows[0].LastName || leadRes.rows[0].lastname || '';
            leadName = `${first} ${last}`.trim();
            email = leadRes.rows[0].Email || leadRes.rows[0].email || null;
          }
        } catch (e) {
          console.warn(`Error al consultar datos de Lead para ID ${chat.lead_id}:`, (e as Error).message);
        }
      }

      chatsList.push({
        id: chat.id,
        message_id: chat.message_id,
        lead_id: chat.lead_id,
        remote_jid: chat.remote_jid,
        phone,
        lead_name: leadName || `+${phone}`,
        email,
        body: chat.body,
        timestamp: chat.timestamp,
        from_me: chat.from_me,
        advisor_name: chat.advisor_name,
        is_crm_contact: !!chat.lead_id
      });
    }

    // Ordenar cronológicamente (más recientes primero)
    chatsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      chats: chatsList,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/contacts/whatsapp/chats:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno al listar chats', error: (error as Error).message },
      { status: 500 }
    );
  }
}

function getMockChats() {
  const baseDate = new Date();
  return [
    {
      id: 1,
      message_id: 'msg-mock-4',
      lead_id: '1',
      remote_jid: '56987654321@s.whatsapp.net',
      phone: '56987654321',
      lead_name: 'José Pérez',
      email: 'jose.perez@gmail.com',
      body: 'Excelente José, te llamo a esa hora. ¡Saludos!',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 30).toISOString(), // Hace 30 min
      from_me: true,
      advisor_name: 'Orlando Castillo',
      is_crm_contact: true
    },
    {
      id: 2,
      message_id: 'msg-mock-11',
      lead_id: '2',
      remote_jid: '56976543210@s.whatsapp.net',
      phone: '56976543210',
      lead_name: 'María López',
      email: 'maria.lopez@yahoo.com',
      body: 'Hola, ¡muy buenas tardes! Qué gusto que nos contactes. El proyecto Arena y Sol se encuentra ubicado a pocos minutos de la costa. ¿Te gustaría agendar una visita a terreno?',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 120).toISOString(), // Hace 2 horas
      from_me: true,
      advisor_name: 'Marcela Espinoza',
      is_crm_contact: true
    },
    {
      id: 3,
      message_id: 'msg-mock-100',
      lead_id: null,
      remote_jid: '56999998888@s.whatsapp.net',
      phone: '56999998888',
      lead_name: '+56999998888',
      email: null,
      body: 'Hola, ¿con quién puedo hablar sobre los lotes de Arena y Sol? Vi la publicidad.',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 20).toISOString(), // Hace 20 min
      from_me: false,
      advisor_name: 'WhatsApp Sistema',
      is_crm_contact: false
    }
  ];
}
