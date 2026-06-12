import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { syncEvolutionChats } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jid = searchParams.get('jid') || '';

    if (!jid) {
      return NextResponse.json({ message: 'JID es requerido' }, { status: 400 });
    }

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
      const mockMsgs = getMockMessagesForJid(jid);
      return NextResponse.json({
        success: true,
        messages: mockMsgs,
        isMock: true
      });
    }

    // 2. Consultar los mensajes almacenados PRIMERO para responder de inmediato
    const query = `
      SELECT id, message_id, lead_id, remote_jid, from_me, body, timestamp, instance_id, advisor_name
      FROM whatsapp_messages
      WHERE remote_jid = $1
      ORDER BY timestamp ASC
    `;

    const res = await queryMarketing(query, [jid]);

    // 3. Ejecutar sincronización incremental en SEGUNDO PLANO (sin bloquear la respuesta)
    // Solo sincroniza las últimas 24 horas para este JID específico
    syncEvolutionChats(jid, 24).catch(e => {
      console.warn(`[WhatsApp API Messages] Error en sincronización en segundo plano para ${jid}:`, (e as Error).message);
    });

    return NextResponse.json({
      success: true,
      messages: res.rows,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/contacts/whatsapp/messages:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno al obtener mensajes', error: (error as Error).message },
      { status: 500 }
    );
  }
}

function getMockMessagesForJid(jid: string) {
  const baseDate = new Date();
  const phone = jid.split('@')[0];

  if (phone === '56987654321') {
    return [
      {
        id: 1,
        message_id: 'msg-mock-1',
        lead_id: '1',
        remote_jid: jid,
        from_me: false,
        body: 'Hola, me interesa recibir más información sobre el proyecto Lomas del Mar.',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24).toISOString(),
        instance_id: 'orlando-wa',
        advisor_name: 'Orlando Castillo'
      },
      {
        id: 2,
        message_id: 'msg-mock-2',
        lead_id: '1',
        remote_jid: jid,
        from_me: true,
        body: '¡Hola José! Qué gusto saludarte. Claro que sí, con mucho gusto. ¿Te gustaría agendar una llamada breve hoy para contarte más detalles sobre los lotes disponibles?',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 23.5).toISOString(),
        instance_id: 'orlando-wa',
        advisor_name: 'Orlando Castillo'
      },
      {
        id: 3,
        message_id: 'msg-mock-3',
        lead_id: '1',
        remote_jid: jid,
        from_me: false,
        body: 'Sí, por favor. A las 16:00 horas me queda bien.',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 23).toISOString(),
        instance_id: 'orlando-wa',
        advisor_name: 'Orlando Castillo'
      },
      {
        id: 4,
        message_id: 'msg-mock-4',
        lead_id: '1',
        remote_jid: jid,
        from_me: true,
        body: 'Excelente José, te llamo a esa hora. ¡Saludos!',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 22.8).toISOString(),
        instance_id: 'orlando-wa',
        advisor_name: 'Orlando Castillo'
      }
    ];
  } else if (phone === '56976543210') {
    return [
      {
        id: 10,
        message_id: 'msg-mock-10',
        lead_id: '2',
        remote_jid: jid,
        from_me: false,
        body: 'Hola, vi un anuncio en Instagram sobre terrenos de Arena y Sol.',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 48).toISOString(),
        instance_id: 'marcela-wa',
        advisor_name: 'Marcela Espinoza'
      },
      {
        id: 11,
        message_id: 'msg-mock-11',
        lead_id: '2',
        remote_jid: jid,
        from_me: true,
        body: 'Hola, ¡muy buenas tardes! Qué gusto que nos contactes. El proyecto Arena y Sol se encuentra ubicado a pocos minutos de la costa. ¿Te gustaría agendar una visita a terreno?',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 47).toISOString(),
        instance_id: 'marcela-wa',
        advisor_name: 'Marcela Espinoza'
      }
    ];
  } else {
    // Unlinked chat mock
    return [
      {
        id: 100,
        message_id: 'msg-mock-100',
        lead_id: null,
        remote_jid: jid,
        from_me: false,
        body: 'Hola, ¿con quién puedo hablar sobre los lotes de Arena y Sol? Vi la publicidad.',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 20).toISOString(),
        instance_id: 'general-wa',
        advisor_name: 'WhatsApp Sistema'
      }
    ];
  }
}
