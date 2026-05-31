import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { campaignId, filters, advancedFilters, dateRange } = await request.json();

    const whereClauses = ['1=1'];
    const params: (string | number | Date | string[])[] = [];

    // 1. Descubrir esquema de columnas dinámicamente
    let columns: string[] = [];
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map(r => r.column_name);
    } catch (e) {
      console.warn('Error descubriendo esquema en preview:', e);
    }

    const findCol = (name: string) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      return match ? `"${match}"` : null;
    };

    const statusCol = findCol('status') || '"Status"';
    const sourceCol = findCol('source') || '"Source"';
    const projectCol = findCol('project') || '"Project"';
    const ratingCol = findCol('rating') || '"rating"';
    const utmSourceCol = findCol('utmsource') || '"utmSource"';
    const utmMediumCol = findCol('utmmedium') || '"utmMedium"';
    const utmCampaignCol = findCol('utmcampaign') || '"utmCampaign"';
    const idCol = findCol('id') || '"id"';
    const rawCreatedAtCol = findCol('createdat') || findCol('created_at') || findCol('created');
    const createdAtCol = rawCreatedAtCol || '"createdAt"';
    const emailCol = findCol('email') || '"email"';

    const firstNameCol = findCol('firstname') || findCol('first_name') || '"FirstName"';

    // 2. Filtros Básicos o IDs (Listas Estáticas)
    if (filters?.ids && Array.isArray(filters.ids)) {
      params.push(filters.ids);
      whereClauses.push(`${idCol} = ANY($${params.length})`);
    } else {
      if (filters?.status && columns.includes(statusCol.replace(/"/g, ''))) {
        params.push(filters.status);
        whereClauses.push(`${statusCol} ILIKE $${params.length}`);
      }
      if (filters?.source && columns.includes(sourceCol.replace(/"/g, ''))) {
        const srcLower = filters.source.toLowerCase();
        if (srcLower === 'sitio web' || srcLower === 'web' || srcLower === 'aliminspa.cl') {
          whereClauses.push(`(${sourceCol} ILIKE 'web' OR ${sourceCol} ILIKE 'Sitio Web' OR ${sourceCol} ILIKE 'Sitio web' OR ${sourceCol} ILIKE '%aliminspa%')`);
        } else {
          params.push(filters.source);
          whereClauses.push(`${sourceCol} ILIKE $${params.length}`);
        }
      }
      if (filters?.project && columns.includes(projectCol.replace(/"/g, ''))) {
        params.push(filters.project);
        whereClauses.push(`(${projectCol} ILIKE $${params.length} OR ${sourceCol} ILIKE $${params.length})`);
      }
      if (filters?.interest && columns.includes(ratingCol.replace(/"/g, ''))) {
        params.push(filters.interest);
        whereClauses.push(`${ratingCol} ILIKE $${params.length}`);
      }
      if (filters?.utmSource && columns.includes(utmSourceCol.replace(/"/g, ''))) {
        params.push(filters.utmSource);
        whereClauses.push(`${utmSourceCol} ILIKE $${params.length}`);
      }
      if (filters?.utmMedium && columns.includes(utmMediumCol.replace(/"/g, ''))) {
        params.push(filters.utmMedium);
        whereClauses.push(`${utmMediumCol} ILIKE $${params.length}`);
      }
      if (filters?.utmCampaign && columns.includes(utmCampaignCol.replace(/"/g, ''))) {
        params.push(filters.utmCampaign);
        whereClauses.push(`${utmCampaignCol} ILIKE $${params.length}`);
      }
      if (filters?.activity) {
        const act = filters.activity;
        if (act === 'web_subscription') {
          const colUtm = findCol('utmsource') || '"utmSource"';
          const colInt = findCol('interests') || '"interests"';
          const colSrc = findCol('source') || '"Source"';
          let clauses = `(${colSrc} ILIKE 'web' OR ${colSrc} ILIKE '%aliminspa%')`;
          if (columns.includes(colUtm.replace(/"/g, ''))) clauses += ` OR ${colUtm} IS NOT NULL`;
          if (columns.includes(colInt.replace(/"/g, ''))) clauses += ` OR ${colInt} IS NOT NULL`;
          whereClauses.push(`(${clauses})`);
        } else if (act === 'meta_conversion') {
          const colForm = findCol('formid') || '"formId"';
          const colAd = findCol('adname') || '"adName"';
          const clauses: string[] = [];
          if (columns.includes(colForm.replace(/"/g, ''))) clauses.push(`${colForm} IS NOT NULL`);
          if (columns.includes(colAd.replace(/"/g, ''))) clauses.push(`${colAd} IS NOT NULL`);
          if (clauses.length > 0) {
            whereClauses.push(`(${clauses.join(' OR ')})`);
          }
        } else if (act === 'visit') {
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
        } else if (act === 'reservation') {
          const colStat = findCol('status') || '"Status"';
          const colSign = findCol('signingstatus') || '"signingStatus"';
          let clauses = `${colStat} ILIKE 'Reservado'`;
          if (columns.includes(colSign.replace(/"/g, ''))) clauses += ` OR ${colSign} IS NOT NULL`;
          whereClauses.push(`(${clauses})`);
        }
      }
    }

    // 3. Filtros Avanzados Dinámicos
    if (Array.isArray(advancedFilters)) {
      advancedFilters.forEach((filter: { column: string; operator: string; value: string }) => {
        if (!filter.column || !filter.value) return;
        
        const safeCol = `"${filter.column.replace(/"/g, '')}"`;
        
        switch (filter.operator) {
          case 'equals':
            params.push(filter.value);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          case 'contains':
            params.push(`%${filter.value}%`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          case 'starts_with':
            params.push(`${filter.value}%`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          case 'ends_with':
            params.push(`%${filter.value}`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          default:
            params.push(filter.value);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
        }
      });
    }

    const startVal = dateRange?.start || filters?.startDate;
    const endVal = dateRange?.end || filters?.endDate;

    if (startVal && rawCreatedAtCol) {
      params.push(new Date(startVal));
      whereClauses.push(`${createdAtCol} >= $${params.length}`);
    }
    if (endVal && rawCreatedAtCol) {
      const endDateVal = new Date(endVal);
      endDateVal.setHours(23, 59, 59, 999);
      params.push(endDateVal);
      whereClauses.push(`${createdAtCol} <= $${params.length}`);
    }

    const whereString = whereClauses.join(' AND ');

    // 4. Obtener correos enviados/pendientes para esta campaña desde la DB de Marketing
    let sentEmails = new Set<string>();
    if (campaignId) {
      try {
        const logsRes = await queryMarketing(
          `SELECT email FROM campaign_logs WHERE campaign_id = $1 AND status IN ('SENT', 'PENDING')`,
          [campaignId]
        );
        sentEmails = new Set(logsRes.rows.map((r: { email: string }) => r.email.toLowerCase()));
      } catch (err) {
        console.warn('Error fetching campaign logs for exclusion in preview:', err);
      }
    }

    // 5. Conteo Total (CRM)
    const totalCountRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${whereString}`, params);
    const totalCount = parseInt(totalCountRes.rows[0].total, 10);

    // 6. Conteo Enviables (Únicos y Excluidos)
    // Para resolverlo de forma correcta sin cross-database joins, traemos la lista y filtramos en memoria
    const leadsRes = await queryMain(`
      SELECT DISTINCT ON (${emailCol}) 
        ${idCol} as id, 
        ${emailCol} as email, 
        ${columns.includes(firstNameCol.replace(/"/g, '')) ? `${firstNameCol} as firstname, ` : ''} 
        ${rawCreatedAtCol ? `${createdAtCol} as createdat` : '1 as createdat'}
      FROM "Lead" 
      WHERE ${whereString} 
        AND ${emailCol} IS NOT NULL AND ${emailCol} != ''
      ORDER BY ${emailCol}, ${rawCreatedAtCol ? createdAtCol : '1'} DESC
    `, params);

    const allLeads = leadsRes.rows;

    // Filtrar leads que no han recibido la campaña aún
    const filteredLeads = campaignId 
      ? allLeads.filter((l: { email?: string; Email?: string }) => !sentEmails.has((l.email || l.Email || '').toLowerCase()))
      : allLeads;

    const mailableCount = filteredLeads.length;

    // 7. Previsualización (Muestra los primeros 100 ordenados por fecha de creación)
    const sortedLeads = [...filteredLeads].sort((a: { createdat?: string | Date }, b: { createdat?: string | Date }) => {
      const dateA = a.createdat ? new Date(a.createdat).getTime() : 0;
      const dateB = b.createdat ? new Date(b.createdat).getTime() : 0;
      return dateB - dateA;
    });

    const previewLeads = sortedLeads.slice(0, 100);

    return NextResponse.json({ 
      count: mailableCount,
      mailableCount,
      totalCount,
      preview: previewLeads 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al previsualizar leads';
    console.error('Error al previsualizar leads:', error);
    // Retornamos un 200 con error para que la UI pueda mostrarlo sin explotar
    return NextResponse.json({ message, preview: [], count: 0 }, { status: 200 });
  }
}
