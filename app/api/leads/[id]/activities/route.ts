import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  details?: Record<string, unknown>;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    // 1. Verificar esquema y conexión
    let dbConnected = false;
    let tables: string[] = [];

    try {
      const tableCheck = await queryMarketing(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      tables = tableCheck.rows.map(r => r.table_name.toLowerCase());
      dbConnected = tables.length > 0;
    } catch (e) {
      console.warn('DB check failed in lead activities endpoint, running in offline/mock mode:', (e as Error).message);
    }

    // 2. Si no hay DB, retornar un historial simulado
    if (!dbConnected) {
      const mockEvents = getMockEvents(id);
      const filteredEvents = filterEvents(mockEvents, startDate, endDate);
      return NextResponse.json({
        success: true,
        events: filteredEvents,
        isMock: true
      });
    }

    // 3. Obtener el lead para registrar su fecha de creación
    let leadCreatedAt: string | null = null;
    let leadSource = 'Manual';
    try {
      const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [id]);
      if (leadRes.rows.length > 0) {
        const lead = leadRes.rows[0];
        leadCreatedAt = lead.CreatedAt || lead.createdAt || lead.created_at || null;
        leadSource = lead.Source || lead.source || 'Manual';
      }
    } catch (e) {
      console.warn('Error reading lead from Main DB:', e);
    }

    const eventsList: ActivityEvent[] = [];

    // 4. Agregar evento de creación del lead (si existe la fecha)
    if (leadCreatedAt) {
      eventsList.push({
        id: `created-${id}`,
        type: 'SYSTEM_CREATED',
        title: 'Contacto Creado en el Sistema',
        description: `Ingreso inicial registrado con origen principal: ${leadSource}`,
        date: new Date(leadCreatedAt).toISOString(),
        details: { source: leadSource }
      });
    }

    // 5. Consultar logs de campañas (si existe la tabla campaign_logs y campaigns)
    if (tables.includes('campaign_logs') && tables.includes('campaigns')) {
      try {
        const campaignLogsRes = await queryMarketing(`
          SELECT 
            cl.id,
            cl.status,
            cl.sent_at,
            cl.opened_at,
            cl.clicks,
            cl.last_clicked_at,
            cl.created_at as cl_created_at,
            c.id as campaign_id,
            c.title as campaign_title,
            c.subject as campaign_subject
          FROM campaign_logs cl
          JOIN campaigns c ON cl.campaign_id = c.id
          WHERE cl.lead_id = $1
        `, [id]);

        for (const log of campaignLogsRes.rows) {
          // Evento de Envío
          const dateSent = log.sent_at || log.cl_created_at;
          const isTest = log.status === 'TEST';
          if (dateSent) {
            eventsList.push({
              id: `email-sent-${log.id}`,
              type: 'EMAIL_SENT',
              title: isTest ? 'Correo de Prueba Enviado' : 'Correo Enviado',
              description: `Campaña: "${log.campaign_title || 'Sin Título'}" | Asunto: "${log.campaign_subject || 'Sin Asunto'}"`,
              date: new Date(dateSent).toISOString(),
              details: { campaign_id: log.campaign_id }
            });
          }

          // Evento de Apertura
          if (log.opened_at || log.status === 'OPENED') {
            const dateOpen = log.opened_at || dateSent;
            eventsList.push({
              id: `email-open-${log.id}`,
              type: 'EMAIL_OPENED',
              title: 'Correo Abierto',
              description: `El destinatario abrió el correo de la campaña "${log.campaign_title || 'Sin Título'}"`,
              date: new Date(dateOpen).toISOString(),
              details: { campaign_id: log.campaign_id }
            });
          }

          // Evento de Clic
          if (log.clicks > 0 || log.last_clicked_at) {
            const dateClick = log.last_clicked_at || dateSent;
            eventsList.push({
              id: `email-click-${log.id}`,
              type: 'EMAIL_CLICKED',
              title: 'Enlace Clickeado en Correo',
              description: `El destinatario hizo clic en un enlace del correo de la campaña "${log.campaign_title || 'Sin Título'}" (${log.clicks} clic(s))`,
              date: new Date(dateClick).toISOString(),
              details: { campaign_id: log.campaign_id, clicks: log.clicks }
            });
          }
        }
      } catch (e) {
        console.error('Error querying campaign logs:', e);
      }
    }

    // 6. Consultar actividades web (si existe la tabla lead_activities)
    if (tables.includes('lead_activities')) {
      try {
        const activitiesRes = await queryMarketing(`
          SELECT id, event_type, page_url, page_title, details, created_at
          FROM lead_activities
          WHERE lead_id = $1
        `, [id]);

        for (const act of activitiesRes.rows) {
          const eventType = act.event_type;
          let title = 'Actividad Web';
          let description = 'El usuario realizó una acción en la web';

          if (eventType === 'PAGE_VIEW' || eventType === 'PAGE_VISIT') {
            title = 'Página Web Visitada';
            description = `Visitó la página "${act.page_title || 'Sin Título'}" (${act.page_url || ''})`;
          } else if (eventType === 'FORM_SUBMIT') {
            const formName = act.details?.form_name || 'Formulario';
            title = `Formulario Enviado: ${formName}`;
            description = 'Envió datos a través del formulario de la web';
          } else if (eventType === 'CLICK_BUTTON') {
            const btnName = act.details?.element_name || 'Botón';
            const catName = act.details?.category || 'General';
            title = 'Clic en Botón de Interés';
            description = `Hizo clic en el botón "${btnName}" (Categoría: ${catName})`;
          }

          eventsList.push({
            id: `web-act-${act.id}`,
            type: eventType,
            title,
            description,
            date: new Date(act.created_at).toISOString(),
            details: {
              page_url: act.page_url,
              page_title: act.page_title,
              ...act.details
            }
          });
        }
      } catch (e) {
        console.error('Error querying lead activities:', e);
      }
    }

    // 7. Filtrar por fechas
    const filteredEvents = filterEvents(eventsList, startDate, endDate);

    // 8. Ordenar cronológicamente (más recientes primero)
    filteredEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      events: filteredEvents,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/leads/[id]/activities:', error);
    return NextResponse.json(
      { success: false, message: 'Error al obtener el historial de actividades', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Filtro de rango de fechas para los eventos
function filterEvents(events: ActivityEvent[], startDate: string, endDate: string) {
  if (!startDate && !endDate) return events;

  const start = startDate ? new Date(startDate).getTime() : 0;
  const end = endDate ? new Date(endDate) : null;
  if (end) {
    end.setHours(23, 59, 59, 999);
  }
  const endTime = end ? end.getTime() : Infinity;

  return events.filter(event => {
    const eventTime = new Date(event.date).getTime();
    return eventTime >= start && eventTime <= endTime;
  });
}

// Mock events generator when database is offline or not configured
function getMockEvents(leadId: string): ActivityEvent[] {
  const baseDate = new Date();
  return [
    {
      id: `created-${leadId}`,
      type: 'SYSTEM_CREATED',
      title: 'Contacto Creado en el Sistema',
      description: 'Ingreso inicial registrado con origen principal: Sitio Web',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 5).toISOString(), // Hace 5 días
      details: { source: 'Sitio Web' }
    },
    {
      id: `email-sent-mock-1`,
      type: 'EMAIL_SENT',
      title: 'Correo Enviado',
      description: 'Campaña: "Lanzamiento Lomas del Mar II" | Asunto: "Descubre tu nuevo terreno"',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(), // Hace 3 días
      details: { campaign_id: 'mock-camp-1' }
    },
    {
      id: `email-open-mock-1`,
      type: 'EMAIL_OPENED',
      title: 'Correo Abierto',
      description: 'El destinatario abrió el correo de la campaña "Lanzamiento Lomas del Mar II"',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 15).toISOString(), // 15 min después
      details: { campaign_id: 'mock-camp-1' }
    },
    {
      id: `email-click-mock-1`,
      type: 'EMAIL_CLICKED',
      title: 'Enlace Clickeado en Correo',
      description: 'El destinatario hizo clic en un enlace del correo de la campaña "Lanzamiento Lomas del Mar II" (1 clic)',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 18).toISOString(), // 18 min después
      details: { campaign_id: 'mock-camp-1', clicks: 1 }
    },
    {
      id: `web-pageview-mock-1`,
      type: 'PAGE_VIEW',
      title: 'Página Web Visitada',
      description: 'Visitó la página "Inicio - Terrenos Alimin"',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 19).toISOString(),
      details: { page_url: 'https://aliminspa.cl/', page_title: 'Inicio - Terrenos Alimin' }
    },
    {
      id: `web-pageview-mock-2`,
      type: 'PAGE_VIEW',
      title: 'Página Web Visitada',
      description: 'Visitó la página "Lomas del Mar - Proyecto"',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 21).toISOString(),
      details: { page_url: 'https://aliminspa.cl/lomas-del-mar', page_title: 'Lomas del Mar - Proyecto' }
    },
    {
      id: `web-click-mock-1`,
      type: 'CLICK_BUTTON',
      title: 'Clic en Botón de Interés',
      description: 'Hizo clic en el botón "Ver Ubicación Terreno" (Categoría: Ubicación)',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 25).toISOString(),
      details: { element_name: 'Ver Ubicación Terreno', category: 'Ubicación' }
    },
    {
      id: `web-form-mock-1`,
      type: 'FORM_SUBMIT',
      title: 'Formulario Enviado: Cotizar Terreno',
      description: 'Envió datos a través del formulario de la web',
      date: new Date(baseDate.getTime() - 1000 * 60 * 60 * 24 * 3 + 1000 * 60 * 30).toISOString(),
      details: { form_name: 'Cotizar Terreno', data: { nombre: 'Nicolás', mensaje: 'Me interesa cotizar el lote A-12' } }
    }
  ];
}
