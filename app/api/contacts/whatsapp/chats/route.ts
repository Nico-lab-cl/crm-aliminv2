import { NextResponse } from 'next/server';
import { syncEvolutionChats, getEvolutionAdvisors, normalizeAdvisorName } from '@/lib/evolution_sync';
import { queryMain, queryMarketing } from '@/lib/db';

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
        console.log('[WhatsApp API Chats] Sincronizando chats incrementalmente en segundo plano...');
        // Ejecutar en segundo plano sin await para responder de inmediato
        syncEvolutionChats(undefined, 24).catch(err => {
          console.error('[WhatsApp API Chats] Error en sincronización en segundo plano:', err);
        });
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
        advisor_name,
        push_name
      FROM whatsapp_messages
      ORDER BY remote_jid, timestamp DESC
    `;

    const res = await queryMarketing(query);
    const rawChats = res.rows;

    // 4. Mapear nombres de Leads a los chats vinculados
    const chatsList = [];
    const leadIds = rawChats.map((c: any) => c.lead_id).filter(Boolean);
    const leadMap = new Map<string, any>();

    if (leadIds.length > 0) {
      try {
        const leadsRes = await queryMain(`
          SELECT l.id, l."firstName", l."lastName", l.phone, l.email, u.name as "assignedAdvisor"
          FROM "Lead" l
          LEFT JOIN "User" u ON l."assignedToId" = u.id
          WHERE l.id = ANY($1)
        `, [leadIds]);

        for (const row of leadsRes.rows) {
          leadMap.set(row.id, row);
        }
      } catch (e) {
        console.warn('[WhatsApp API Chats] Error al realizar batch query de Leads:', (e as Error).message);
      }
    }

    for (const chat of rawChats) {
      let leadName = null;
      let email = null;
      let leadPhone = null;
      let leadAdvisorName = null;
      const phone = chat.remote_jid.split('@')[0].replace(/\D/g, '');

      if (chat.lead_id && leadMap.has(chat.lead_id)) {
        const row = leadMap.get(chat.lead_id);
        const first = row.firstName || row.FirstName || row.firstname || '';
        const last = row.lastName || row.LastName || row.lastname || '';
        leadName = `${first} ${last}`.trim();
        email = row.email || row.Email || null;
        leadPhone = row.phone || row.Phone || null;
        leadAdvisorName = row.assignedAdvisor || null;
      }

      const displayPhone = leadPhone ? leadPhone.replace(/\D/g, '') : phone;

      chatsList.push({
        id: chat.id,
        message_id: chat.message_id,
        lead_id: chat.lead_id,
        remote_jid: chat.remote_jid,
        phone: displayPhone,
        lead_name: leadName || chat.push_name || `+${phone}`,
        email,
        body: chat.body,
        timestamp: chat.timestamp,
        from_me: chat.from_me,
        advisor_name: normalizeAdvisorName(leadAdvisorName || chat.advisor_name),
        is_crm_contact: !!chat.lead_id
      });
    }

    // Ordenar cronológicamente (más recientes primero)
    chatsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Obtener lista de asesores directamente de Evolution API (todas las instancias)
    let advisors: string[] = [];
    try {
      advisors = await getEvolutionAdvisors();
    } catch (e) {
      console.warn('[WhatsApp API Chats] Error al obtener asesores de Evolution:', (e as Error).message);
      // Fallback: extraer asesores únicos de los chats
      advisors = Array.from(new Set(chatsList.map(c => c.advisor_name).filter(n => n && n !== 'WhatsApp Sistema')));
    }

    return NextResponse.json({
      success: true,
      chats: chatsList,
      advisors,
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

export async function POST(request: Request) {
  try {
    const { remote_jid, lead_id } = await request.json();

    if (!remote_jid || !lead_id) {
      return NextResponse.json({ success: false, message: 'Falta JID o ID del Lead' }, { status: 400 });
    }

    await queryMarketing(`
      UPDATE whatsapp_messages 
      SET lead_id = $1 
      WHERE remote_jid = $2
    `, [lead_id, remote_jid]);

    return NextResponse.json({ success: true, message: 'Conversación vinculada correctamente' });
  } catch (error) {
    console.error('Error in POST /api/contacts/whatsapp/chats:', error);
    return NextResponse.json(
      { success: false, message: 'Error al vincular conversación', error: (error as Error).message },
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
      advisor_name: 'Orlando Costa',
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
      advisor_name: 'Marcela Escobar',
      is_crm_contact: true
    },
    {
      id: 4,
      message_id: 'msg-mock-200',
      lead_id: '3',
      remote_jid: '56965432109@s.whatsapp.net',
      phone: '56965432109',
      lead_name: 'Carlos Valenzuela',
      email: 'carlos.v@outlook.com',
      body: 'Hola Bárbara, ya revisé los planos y me interesa coordinar la visita.',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 15).toISOString(), // Hace 15 min
      from_me: false,
      advisor_name: 'Barbara Arias',
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
