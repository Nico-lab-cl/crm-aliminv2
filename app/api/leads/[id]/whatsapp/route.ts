import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { syncEvolutionChats } from '@/lib/evolution_sync';

interface WhatsappMessage {
  id: number;
  message_id: string;
  lead_id: string | null;
  remote_jid: string;
  from_me: boolean;
  body: string;
  timestamp: string | Date;
  instance_id: string;
  advisor_name: string;
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Verificar esquema y conexión (para soportar desarrollo local sin DB activa)
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
      const mockMsgs = getMockWhatsappMessages(id);
      return NextResponse.json({
        success: true,
        messages: mockMsgs,
        phone: id === '1' ? '+56 9 8765 4321' : '+56 9 7654 3210',
        jid: id === '1' ? '56987654321@s.whatsapp.net' : '56976543210@s.whatsapp.net'
      });
    }

    // 2. Obtener los datos del lead en el CRM (principalmente el teléfono)
    let phone = '';
    let jid = '';
    
    try {
      const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [id]);
      if (leadRes.rows.length > 0) {
        const lead = leadRes.rows[0];
        phone = lead.Phone || lead.phone || '';
      }
    } catch (e) {
      console.warn(`[WhatsApp API] No se pudo obtener el teléfono del lead ${id}:`, (e as Error).message);
    }

    // 2. Si el lead tiene teléfono, intentar sincronizar de forma incremental para este JID
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone) {
        // En WhatsApp los JIDs individuales terminan en @s.whatsapp.net
        jid = `${cleanPhone}@s.whatsapp.net`;
        
        try {
          console.log(`[WhatsApp API] Sincronizando por demanda para JID: ${jid}...`);
          // Sincronizar mensajes de este JID
          // Buscamos hacia atrás hasta 30 días para asegurarnos de traer chats si es el primer acceso,
          // pero el motor es incremental (si ya hay mensajes, solo descarga lo nuevo).
          await syncEvolutionChats(jid, 720); // 720 horas = 30 días
        } catch (e) {
          // Si el VPS o la DB externa no está disponible, informamos en consola pero no fallamos la petición
          console.warn(`[WhatsApp API] Falló la conexión/sync con Evolution DB. Mostrando datos offline del CRM:`, (e as Error).message);
        }
      }
    }

    // 3. Consultar los mensajes almacenados localmente en nuestro CRM
    // Filtramos por lead_id o por remote_jid para mayor redundancia
    let messages: WhatsappMessage[] = [];
    try {
      const query = `
        SELECT id, message_id, lead_id, remote_jid, from_me, body, timestamp, instance_id, advisor_name
        FROM whatsapp_messages
        WHERE lead_id = $1 ${jid ? 'OR remote_jid = $2' : ''}
        ORDER BY timestamp ASC
      `;
      
      const queryParams = jid ? [id, jid] : [id];
      const res = await queryMarketing(query, queryParams);
      messages = res.rows;
    } catch (e) {
      console.error(`[WhatsApp API] Error al leer mensajes de la base de datos local:`, e);
      // Si la tabla no está creada aún, retornamos vacío de forma segura
      messages = [];
    }

    return NextResponse.json({
      success: true,
      messages,
      phone,
      jid
    });

  } catch (error) {
    console.error('Error in GET /api/leads/[id]/whatsapp:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno al obtener mensajes de WhatsApp', error: (error as Error).message },
      { status: 500 }
    );
  }
}

function getMockWhatsappMessages(leadId: string): WhatsappMessage[] {
  const baseDate = new Date();
  
  if (leadId === '1') {
    return [
      {
        id: 1,
        message_id: 'msg-mock-1',
        lead_id: '1',
        remote_jid: '56987654321@s.whatsapp.net',
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
        remote_jid: '56987654321@s.whatsapp.net',
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
        remote_jid: '56987654321@s.whatsapp.net',
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
        remote_jid: '56987654321@s.whatsapp.net',
        from_me: true,
        body: 'Excelente José, te llamo a esa hora. ¡Saludos!',
        timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 22.8).toISOString(),
        instance_id: 'orlando-wa',
        advisor_name: 'Orlando Castillo'
      }
    ];
  }
  
  return [
    {
      id: 10,
      message_id: 'msg-mock-10',
      lead_id: leadId,
      remote_jid: '56976543210@s.whatsapp.net',
      from_me: false,
      body: 'Hola, vi un anuncio en Instagram sobre terrenos de Arena y Sol.',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 48).toISOString(),
      instance_id: 'marcela-wa',
      advisor_name: 'Marcela Espinoza'
    },
    {
      id: 11,
      message_id: 'msg-mock-11',
      lead_id: leadId,
      remote_jid: '56976543210@s.whatsapp.net',
      from_me: true,
      body: 'Hola, ¡muy buenas tardes! Qué gusto que nos contactes. El proyecto Arena y Sol se encuentra ubicado a pocos minutos de la costa. ¿Te gustaría agendar una visita a terreno?',
      timestamp: new Date(baseDate.getTime() - 1000 * 60 * 60 * 47).toISOString(),
      instance_id: 'marcela-wa',
      advisor_name: 'Marcela Espinoza'
    }
  ];
}

