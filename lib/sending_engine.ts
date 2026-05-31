import { queryMain, queryMarketing } from '@/lib/db';

interface SendCampaingOptions {
  campaignId: string;
  leadFilters?: {
    status?: string;
    source?: string;
    project?: string;
  };
  advancedFilters?: Array<{ column: string; operator: string; value: string }>;
  dateRange?: { start?: string; end?: string };
}

export async function executeCampaign(options: SendCampaingOptions) {
  const { campaignId, leadFilters, advancedFilters, dateRange } = options;

  // 1. Obtener la campaña
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  // 2. Construir Query Dinámica de Leads
  let columns: string[] = [];
  try {
    const schemaRes = await queryMain(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    columns = schemaRes.rows.map(r => r.column_name);
  } catch (e) {
    console.warn('Error descubriendo esquema en sending engine:', e);
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
  const createdAtCol = findCol('createdat') || findCol('created_at') || '"createdAt"';

  const whereClauses = ['email IS NOT NULL AND email != \'\''];
  const params: (string | number | Date | string[])[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtersAny = leadFilters as any;

  if (filtersAny?.ids && Array.isArray(filtersAny.ids)) {
    params.push(filtersAny.ids);
    whereClauses.push(`${idCol} = ANY($${params.length})`);
  } else {
    // Filtros Básicos
    if (leadFilters?.status && columns.includes(statusCol.replace(/"/g, ''))) {
      params.push(leadFilters.status);
      whereClauses.push(`${statusCol} ILIKE $${params.length}`);
    }
    if (leadFilters?.source && columns.includes(sourceCol.replace(/"/g, ''))) {
      const srcLower = leadFilters.source.toLowerCase();
      if (srcLower === 'sitio web' || srcLower === 'web' || srcLower === 'aliminspa.cl') {
        whereClauses.push(`(${sourceCol} ILIKE 'web' OR ${sourceCol} ILIKE 'Sitio Web' OR ${sourceCol} ILIKE 'Sitio web' OR ${sourceCol} ILIKE '%aliminspa%')`);
      } else {
        params.push(leadFilters.source);
        whereClauses.push(`${sourceCol} ILIKE $${params.length}`);
      }
    }
    if (leadFilters?.project && columns.includes(projectCol.replace(/"/g, ''))) {
      params.push(leadFilters.project);
      whereClauses.push(`(${projectCol} ILIKE $${params.length} OR ${sourceCol} ILIKE $${params.length})`);
    }
    if (filtersAny?.interest && columns.includes(ratingCol.replace(/"/g, ''))) {
      params.push(filtersAny.interest);
      whereClauses.push(`${ratingCol} ILIKE $${params.length}`);
    }
    if (filtersAny?.utmSource && columns.includes(utmSourceCol.replace(/"/g, ''))) {
      params.push(filtersAny.utmSource);
      whereClauses.push(`${utmSourceCol} ILIKE $${params.length}`);
    }
    if (filtersAny?.utmMedium && columns.includes(utmMediumCol.replace(/"/g, ''))) {
      params.push(filtersAny.utmMedium);
      whereClauses.push(`${utmMediumCol} ILIKE $${params.length}`);
    }
    if (filtersAny?.utmCampaign && columns.includes(utmCampaignCol.replace(/"/g, ''))) {
      params.push(filtersAny.utmCampaign);
      whereClauses.push(`${utmCampaignCol} ILIKE $${params.length}`);
    }
    if (filtersAny?.activity) {
      const act = filtersAny.activity;
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

    // Filtros de fecha de creación
    if (filtersAny?.startDate && columns.includes(createdAtCol.replace(/"/g, ''))) {
      params.push(new Date(filtersAny.startDate));
      whereClauses.push(`${createdAtCol} >= $${params.length}`);
    }
    if (filtersAny?.endDate && columns.includes(createdAtCol.replace(/"/g, ''))) {
      const end = new Date(filtersAny.endDate);
      end.setHours(23, 59, 59, 999);
      params.push(end);
      whereClauses.push(`${createdAtCol} <= $${params.length}`);
    }
  }

  // Filtros Avanzados
  if (Array.isArray(advancedFilters)) {
    advancedFilters.forEach((f) => {
      if (!f.column || !f.value) return;
      const safeCol = `"${f.column.replace(/"/g, '')}"`;
      switch (f.operator) {
        case 'equals':
          params.push(f.value);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
        case 'contains':
          params.push(`%${f.value}%`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
        case 'starts_with':
          params.push(`${f.value}%`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
        case 'ends_with':
          params.push(`%${f.value}`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
      }
    });
  }

  // Filtro de Fecha
  if (dateRange?.start && columns.includes(createdAtCol.replace(/"/g, ''))) {
    params.push(new Date(dateRange.start));
    whereClauses.push(`${createdAtCol} >= $${params.length}`);
  }
  if (dateRange?.end && columns.includes(createdAtCol.replace(/"/g, ''))) {
    const endDateVal = new Date(dateRange.end);
    endDateVal.setHours(23, 59, 59, 999);
    params.push(endDateVal);
    whereClauses.push(`${createdAtCol} <= $${params.length}`);
  }

  const whereString = whereClauses.join(' AND ');
  // DISTINCT ON ("Email") para evitar duplicados y ORDER BY para los más recientes
  const leadQuery = `
    SELECT DISTINCT ON (email) id, email 
    FROM "Lead" 
    WHERE ${whereString} 
    ORDER BY email, ${columns.includes(createdAtCol.replace(/"/g, '')) ? createdAtCol : '1'} DESC
  `;

  const leadsRes = await queryMain(leadQuery, params);
  const leads = leadsRes.rows;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing.aliminspa.cl';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  // 3. Procesar cada lead
  for (const lead of leads) {
    try {
      const emailValue = lead.Email || lead.email; // Manejar posible diferencia de case en el objeto de retorno
      
      const logRes = await queryMarketing(
        `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
         VALUES ($1, $2, $3, 'PENDING') RETURNING id`,
        [campaignId, lead.id, emailValue]
      );
      const logId = logRes.rows[0].id;

      const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
      const htmlWithTrackedLinks = rewriteHtmlLinks(campaign.html_content, logId, appUrl);
      const finalHtml = htmlWithTrackedLinks + trackingPixel;

      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_id: logId,
          campaign_id: campaignId,
          title: campaign.title,
          email: emailValue,
          subject: campaign.subject,
          html: finalHtml,
          design: campaign.mjml_content,
        }),
      }).catch(err => console.error(`Error enviando a n8n:`, err));

      await queryMarketing(
        'UPDATE campaign_logs SET status = \'SENT\', sent_at = CURRENT_TIMESTAMP WHERE id = $1',
        [logId]
      );
    } catch (error) {
      console.error(`Error procesando lead:`, error);
    }
  }

  return { processed: leads.length };
}

export async function sendTestCampaign(campaignId: string, targetEmail: string) {
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing.aliminspa.cl';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  const logRes = await queryMarketing(
    `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
     VALUES ($1, $2, $3, 'TEST') RETURNING id`,
    [campaignId, 'test-id', targetEmail]
  );
  const logId = logRes.rows[0].id;

  const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
  const htmlWithTrackedLinks = rewriteHtmlLinks(campaign.html_content, logId, appUrl);
  const finalHtml = htmlWithTrackedLinks + trackingPixel;

  await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      log_id: logId,
      campaign_id: campaignId,
      title: `[PRUEBA] ${campaign.title}`,
      email: targetEmail,
      subject: `[PRUEBA] ${campaign.subject}`,
      html: finalHtml,
      design: campaign.mjml_content,
    }),
  });

  return { success: true };
}

function rewriteHtmlLinks(html: string, logId: string, appUrl: string): string {
  if (!html) return html;
  
  // Exclude mailto, tel, # anchors, javascript, etc.
  // Match only http/https urls inside href
  const hrefRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"']+)["']/gi;
  
  return html.replace(hrefRegex, (match, url) => {
    // If it's already a tracking URL, don't rewrite it again
    if (url.includes('/api/track/')) {
      return match;
    }
    const trackingUrl = `${appUrl}/api/track/click?log_id=${logId}&url=${encodeURIComponent(url)}`;
    return match.replace(url, trackingUrl);
  });
}
