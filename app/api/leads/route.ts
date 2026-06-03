import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { MOCK_LEADS } from '@/lib/mock_db';
import { parseDateRobust } from '@/lib/date_utils';
import { retroactiveLinkLeads } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const source = searchParams.get('source') || '';
    const project = searchParams.get('project') || '';
    const interest = searchParams.get('interest') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    
    // Filtros avanzados para Segmentos
    const utmSource = searchParams.get('utmSource') || '';
    const utmMedium = searchParams.get('utmMedium') || '';
    const utmCampaign = searchParams.get('utmCampaign') || '';
    const activity = searchParams.get('activity') || '';
    const ids = searchParams.get('ids') || ''; // Lista de IDs separada por comas (Listas Estáticas)

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // 1. Intentar descubrir el esquema de la tabla Lead en la base de datos
    let columns: string[] = [];
    let dbConnected = false;
    
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map(r => r.column_name);
      dbConnected = columns.length > 0;
    } catch (e) {
      console.warn('No se pudo conectar a la base de datos principal, usando datos simulados:', (e as Error).message);
    }

    // 2. Si no hay conexión o no hay datos, devolver datos simulados filtrados en memoria
    if (!dbConnected) {
      let filtered = [...MOCK_LEADS];
      
      if (ids) {
        const idList = ids.split(',');
        filtered = filtered.filter(l => idList.includes(l.id));
      } else {
        if (search) {
          const q = search.toLowerCase();
          filtered = filtered.filter(l => 
            l.FirstName.toLowerCase().includes(q) || 
            l.LastName.toLowerCase().includes(q) || 
            l.Email.toLowerCase().includes(q) || 
            l.Phone.includes(q)
          );
        }
        
        if (status) {
          filtered = filtered.filter(l => l.Status.toLowerCase() === status.toLowerCase());
        }
        if (source) {
          filtered = filtered.filter(l => l.Source.toLowerCase() === source.toLowerCase());
        }
        if (project) {
          filtered = filtered.filter(l => l.Project.toLowerCase() === project.toLowerCase());
        }
        if (startDate) {
          const startParsed = parseDateRobust(startDate);
          if (startParsed) {
            const startTime = startParsed.getTime();
            filtered = filtered.filter(l => {
              const leadDate = parseDateRobust(l.CreatedAt);
              return leadDate ? leadDate.getTime() >= startTime : false;
            });
          }
        }
        if (endDate) {
          const endParsed = parseDateRobust(endDate);
          if (endParsed) {
            endParsed.setHours(23, 59, 59, 999);
            const endTime = endParsed.getTime();
            filtered = filtered.filter(l => {
              const leadDate = parseDateRobust(l.CreatedAt);
              return leadDate ? leadDate.getTime() <= endTime : false;
            });
          }
        }
        if (interest) {
          filtered = filtered.filter(l => {
            const r = l.Rating || 'FRIO';
            return r.toLowerCase() === interest.toLowerCase();
          });
        }
        if (utmSource) {
          filtered = filtered.filter(l => (l.utmSource || l.utm_source || '').toLowerCase() === utmSource.toLowerCase());
        }
        if (utmMedium) {
          filtered = filtered.filter(l => (l.utmMedium || l.utm_medium || '').toLowerCase() === utmMedium.toLowerCase());
        }
        if (utmCampaign) {
          filtered = filtered.filter(l => (l.utmCampaign || l.utm_campaign || '').toLowerCase() === utmCampaign.toLowerCase());
        }
        if (activity) {
          filtered = filtered.filter(l => {
            if (activity === 'web_subscription') {
              return !!l.utmSource || !!l.interests || !!l.Interests || (l.Source || '').toLowerCase().includes('web');
            }
            if (activity === 'meta_conversion') {
              return !!l.formId || !!l.adName;
            }
            if (activity === 'visit') {
              return !!l.visited || !!l.visitProject || !!l.visitDate;
            }
            if (activity === 'reservation') {
              return (l.Status || '').toLowerCase() === 'reservado' || !!l.signingStatus;
            }
            return true;
          });
        }
      }

      const totalCount = filtered.length;
      const paginatedLeads = filtered.slice(offset, offset + limit);

      return NextResponse.json({
        leads: paginatedLeads,
        totalCount,
        page,
        limit,
        isMock: true
      });
    }

    // 3. Si hay conexión a la base de datos, construir consulta dinámica considerando mayúsculas/minúsculas
    const whereClauses: string[] = ['1=1'];
    const params: unknown[] = [];

    // Helper para buscar nombre exacto de la columna en la base de datos
    const findCol = (name: string) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      return match ? `"${match}"` : null;
    };

    const emailCol = findCol('email') || '"Email"';
    const firstNameCol = findCol('firstname') || findCol('name') || '"FirstName"';
    const lastNameCol = findCol('lastname') || '"LastName"';
    const phoneCol = findCol('phone') || '"Phone"';
    const statusCol = findCol('status') || '"Status"';
    const sourceCol = findCol('source') || '"Source"';
    const projectCol = findCol('project') || '"Project"';
    const rawCreatedAtCol = findCol('createdat') || findCol('created_at') || findCol('created');
    const createdAtCol = rawCreatedAtCol || '"CreatedAt"';

    if (ids) {
      const idCol = findCol('id') || '"id"';
      const idList = ids.split(',');
      params.push(idList);
      whereClauses.push(`${idCol} = ANY($${params.length})`);
    } else {
      // Búsqueda por texto (Search)
      if (search) {
        params.push(`%${search}%`);
        const searchIdx = params.length;
        const searchTerms: string[] = [];
        
        if (columns.includes(emailCol.replace(/"/g, ''))) searchTerms.push(`${emailCol} ILIKE $${searchIdx}`);
        if (columns.includes(firstNameCol.replace(/"/g, ''))) searchTerms.push(`${firstNameCol} ILIKE $${searchIdx}`);
        if (columns.includes(lastNameCol.replace(/"/g, ''))) searchTerms.push(`${lastNameCol} ILIKE $${searchIdx}`);
        if (columns.includes(phoneCol.replace(/"/g, ''))) searchTerms.push(`${phoneCol} ILIKE $${searchIdx}`);
        
        if (searchTerms.length > 0) {
          whereClauses.push(`(${searchTerms.join(' OR ')})`);
        }
      }

      // Filtros específicos
      if (status && columns.includes(statusCol.replace(/"/g, ''))) {
        params.push(status);
        whereClauses.push(`${statusCol} ILIKE $${params.length}`);
      }
      if (source && columns.includes(sourceCol.replace(/"/g, ''))) {
        const srcLower = source.toLowerCase();
        if (srcLower === 'sitio web' || srcLower === 'web' || srcLower === 'aliminspa.cl') {
          whereClauses.push(`(${sourceCol} ILIKE 'web' OR ${sourceCol} ILIKE 'Sitio Web' OR ${sourceCol} ILIKE 'Sitio web' OR ${sourceCol} ILIKE '%aliminspa%')`);
        } else {
          params.push(source);
          whereClauses.push(`${sourceCol} ILIKE $${params.length}`);
        }
      }
      
      // Proyecto Inteligente (Filtra por Project, Source, FormId o AdName)
      if (project && columns.includes(projectCol.replace(/"/g, ''))) {
        params.push(project);
        const projIdx = params.length;
        
        const formIdCol = findCol('formid') || findCol('FormId') || '"FormId"';
        const adNameCol = findCol('adname') || findCol('AdName') || '"AdName"';
        
        let projectFilter = `(${projectCol} ILIKE $${projIdx} OR ${sourceCol} ILIKE $${projIdx}`;
        
        const projLower = project.toLowerCase();
        if (projLower.includes('lomas') || projLower.includes('mar')) {
          projectFilter += ` OR ${formIdCol} = '798890826611593'`;
          if (columns.includes(adNameCol.replace(/"/g, ''))) {
            projectFilter += ` OR ${adNameCol} ILIKE '%lomas%' OR ${adNameCol} ILIKE '%mar%'`;
          }
        } else if (projLower.includes('arena') || projLower.includes('sol')) {
          projectFilter += ` OR ${formIdCol} = '1896385304349584'`;
          if (columns.includes(adNameCol.replace(/"/g, ''))) {
            projectFilter += ` OR ${adNameCol} ILIKE '%arena%' OR ${adNameCol} ILIKE '%sol%'`;
          }
        }
        
        projectFilter += `)`;
        whereClauses.push(projectFilter);
      }

      // Filtro por Interés (mapeado a la columna Rating / Temperatura en el CRM)
      if (interest) {
        const ratingCol = findCol('rating') || '"rating"';
        if (ratingCol && columns.includes(ratingCol.replace(/"/g, ''))) {
          params.push(interest);
          whereClauses.push(`${ratingCol} ILIKE $${params.length}`);
        }
      }

      // Filtro por UTM Source
      if (utmSource) {
        const col = findCol('utmsource') || '"utmSource"';
        if (columns.includes(col.replace(/"/g, ''))) {
          params.push(utmSource);
          whereClauses.push(`${col} ILIKE $${params.length}`);
        }
      }

      // Filtro por UTM Medium
      if (utmMedium) {
        const col = findCol('utmmedium') || '"utmMedium"';
        if (columns.includes(col.replace(/"/g, ''))) {
          params.push(utmMedium);
          whereClauses.push(`${col} ILIKE $${params.length}`);
        }
      }

      // Filtro por UTM Campaign
      if (utmCampaign) {
        const col = findCol('utmcampaign') || '"utmCampaign"';
        if (columns.includes(col.replace(/"/g, ''))) {
          params.push(utmCampaign);
          whereClauses.push(`${col} ILIKE $${params.length}`);
        }
      }

      // Filtro por Actividad Técnica
      if (activity) {
        if (activity === 'web_subscription') {
          const colUtm = findCol('utmsource') || '"utmSource"';
          const colInt = findCol('interests') || '"interests"';
          const colSrc = findCol('source') || '"Source"';
          let clauses = `(${colSrc} ILIKE 'web' OR ${colSrc} ILIKE '%aliminspa%')`;
          if (columns.includes(colUtm.replace(/"/g, ''))) clauses += ` OR ${colUtm} IS NOT NULL`;
          if (columns.includes(colInt.replace(/"/g, ''))) clauses += ` OR ${colInt} IS NOT NULL`;
          whereClauses.push(`(${clauses})`);
        } else if (activity === 'meta_conversion') {
          const colForm = findCol('formid') || '"formId"';
          const colAd = findCol('adname') || '"adName"';
          const clauses: string[] = [];
          if (columns.includes(colForm.replace(/"/g, ''))) clauses.push(`${colForm} IS NOT NULL`);
          if (columns.includes(colAd.replace(/"/g, ''))) clauses.push(`${colAd} IS NOT NULL`);
          if (clauses.length > 0) {
            whereClauses.push(`(${clauses.join(' OR ')})`);
          }
        } else if (activity === 'visit') {
          const colVis = findCol('visited') || '"visited"';
          const colVisProj = findCol('visitproject') || '"visitProject"';
          const colVisDate = findCol('visitdate') || '"visitDate"';
          const clauses: string[] = [];
          if (columns.includes(colVis.replace(/"/g, ''))) clauses.push(`${colVis} = true`);
          if (columns.includes(colVisProj.replace(/"/g, ''))) clauses.push(`${colVisProj} IS NOT NULL`);
          if (columns.includes(colVisDate.replace(/"/g, ''))) clauses.push(`${colVisDate} IS NOT NULL`);
          if (clauses.length > 0) {
            whereClauses.push(`(${clauses.join(' OR ')})`);
          }
        } else if (activity === 'reservation') {
          const colStat = findCol('status') || '"Status"';
          const colSign = findCol('signingstatus') || '"signingStatus"';
          let clauses = `${colStat} ILIKE 'Reservado'`;
          if (columns.includes(colSign.replace(/"/g, ''))) clauses += ` OR ${colSign} IS NOT NULL`;
          whereClauses.push(`(${clauses})`);
        }
      }

      // Filtro por rango de fechas de creación
      console.log('GET /api/leads: Filtering by date:', { startDate, endDate, rawCreatedAtCol, createdAtCol });
      if (startDate && createdAtCol) {
        const startParsed = parseDateRobust(startDate);
        if (startParsed) {
          params.push(startParsed);
          whereClauses.push(`${createdAtCol} >= $${params.length}`);
        }
      }
      if (endDate && createdAtCol) {
        const endParsed = parseDateRobust(endDate);
        if (endParsed) {
          endParsed.setHours(23, 59, 59, 999);
          params.push(endParsed);
          whereClauses.push(`${createdAtCol} <= $${params.length}`);
        }
      }
    }

    const whereStr = whereClauses.join(' AND ');
    console.log('GET /api/leads: database query debug:', { whereStr, params, columns });

    // Consultar el conteo total
    const countRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].total, 10);

    // Consultar leads paginados y ordenados
    // Agregar paginación
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const assignedToCol = columns.find(c => c.toLowerCase() === 'assignedtoid');
    const selectFields = assignedToCol 
      ? `*, (SELECT name FROM "User" WHERE id = "${assignedToCol}") as "AdvisorName"`
      : '*';

    const selectQuery = `
      SELECT ${selectFields}
      FROM "Lead" 
      WHERE ${whereStr} 
      ORDER BY ${rawCreatedAtCol ? createdAtCol : '1'} DESC NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const leadsRes = await queryMain(selectQuery, params);

    return NextResponse.json({
      leads: leadsRes.rows,
      totalCount,
      page,
      limit,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/leads:', error);
    return NextResponse.json({ message: 'Error interno del servidor', error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, status, source, project, lote, etapa } = body;

    if (!email) {
      return NextResponse.json({ message: 'El correo electrónico (Email) es requerido.' }, { status: 400 });
    }

    // 1. Intentar descubrir el esquema
    let columns: string[] = [];
    let dbConnected = false;
    
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map(r => r.column_name);
      dbConnected = columns.length > 0;
    } catch {
      console.warn('No se pudo conectar a la base de datos principal, operando en modo simulado.');
    }

    // 2. Si no hay base de datos, simular inserción exitosa
    if (!dbConnected) {
      const newLead = {
        id: Math.random().toString(36).substr(2, 9),
        FirstName: firstName || '',
        LastName: lastName || '',
        Email: email,
        Phone: phone || '',
        Status: status || 'Nuevo',
        Source: source || 'Manual',
        Project: project || '',
        Lote: lote || '',
        Etapa: etapa || '',
        CreatedAt: new Date().toISOString(),
        Rating: 'FRIO'
      };
      
      // Agregar temporalmente en memoria (para que el cliente lo vea en su sesión local)
      MOCK_LEADS.unshift(newLead);

      // Registrar notificación de registro en modo simulación
      try {
        const displayName = `${firstName || ''} ${lastName || ''}`.trim() || email;
        const titleMsg = 'Nuevo Registro / Contacto (Simulado)';
        const messageMsg = `${displayName} se registró o actualizó sus datos en el sitio web (${project || 'General'})`;
        await queryMarketing(`
          INSERT INTO notifications (lead_id, email, event_type, title, message)
          VALUES ($1, $2, $3, $4, $5)
        `, [null, email, 'LEAD_REGISTERED', titleMsg, messageMsg]);
      } catch (err) {
        console.warn('Error inserting simulated lead registration notification:', err);
      }

      return NextResponse.json({
        success: true,
        message: 'Lead creado con éxito (modo simulación)',
        lead: newLead
      });
    }

    // 3. Si hay base de datos, mapear dinámicamente y hacer el INSERT
    const insertColumns: string[] = [];
    const values: unknown[] = [];
    const placeholders: string[] = [];

    // Helper de mapeo
    const addField = (name: string, value: unknown) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      if (match && value !== undefined && value !== null) {
        insertColumns.push(`"${match}"`);
        values.push(value);
        placeholders.push(`$${values.length}`);
      }
    };

    addField('email', email);
    
    // Manejo de FirstName / LastName o Name unificado
    const nameCol = columns.find(c => c.toLowerCase() === 'name');
    if (nameCol) {
      const fullName = `${firstName || ''} ${lastName || ''}`.trim();
      addField('name', fullName);
    } else {
      addField('firstname', firstName);
      addField('lastname', lastName);
    }

    addField('phone', phone);
    addField('status', status || 'Nuevo');
    addField('source', source || 'Manual');
    addField('project', project || '');
    addField('lote', lote || '');
    addField('etapa', etapa || '');
    
    // Campos de tracking opcionales
    addField('created_at', new Date());
    addField('createdat', new Date());

    if (insertColumns.length === 0) {
      return NextResponse.json({ message: 'No se encontraron columnas mapeables en el esquema.' }, { status: 400 });
    }

    // Ejecutar INSERT con cláusula de conflicto en email
    const emailColName = columns.find(c => c.toLowerCase() === 'email') || 'Email';
    const updateClauses: string[] = [];
    
    insertColumns.forEach((col) => {
      if (col.replace(/"/g, '').toLowerCase() !== 'email') {
        updateClauses.push(`${col} = EXCLUDED.${col}`);
      }
    });

    const query = `
      INSERT INTO "Lead" (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT ("${emailColName}") DO UPDATE
      SET ${updateClauses.join(', ')}
      RETURNING *
    `;

    const res = await queryMain(query, values);

    // Registrar notificación de registro de lead
    try {
      const insertedLead = res.rows[0];
      const leadId = insertedLead.id;
      const first = insertedLead.FirstName || insertedLead.firstname || firstName || '';
      const last = insertedLead.LastName || insertedLead.lastname || lastName || '';
      const displayName = `${first} ${last}`.trim() || email;
      const titleMsg = 'Nuevo Registro / Contacto';
      const messageMsg = `${displayName} se registró o actualizó sus datos en el sitio web (${project || 'General'})`;

      await queryMarketing(`
        INSERT INTO notifications (lead_id, email, event_type, title, message)
        VALUES ($1, $2, $3, $4, $5)
      `, [leadId, email, 'LEAD_REGISTERED', titleMsg, messageMsg]);
    } catch (err) {
      console.warn('Error inserting lead registration notification:', err);
    }

    // Vincular mensajes huérfanos que coincidan con este nuevo lead
    try {
      await retroactiveLinkLeads();
    } catch (e) {
      console.warn('Error linking orphan WhatsApp messages to newly created lead:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Contacto guardado correctamente en la base de datos.',
      lead: res.rows[0]
    });

  } catch (error) {
    console.error('Error in POST /api/leads:', error);
    return NextResponse.json({ message: 'Error al registrar contacto', error: (error as Error).message }, { status: 500 });
  }
}
