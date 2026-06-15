import { queryMain, queryMarketing } from './db';

// Helper to discover Lead columns dynamically
export async function getLeadColumns(): Promise<string[]> {
  try {
    const res = await queryMain(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    return res.rows.map(r => r.column_name);
  } catch (e) {
    console.error('Error discovering Lead columns:', e);
    return [];
  }
}

// Shifts placeholders in a SQL query string (e.g., $1 -> $2, $2 -> $3)
export function shiftPlaceholders(sql: string, shiftBy: number): string {
  return sql.replace(/\$(\d+)/g, (match, num) => {
    return `$${parseInt(num, 10) + shiftBy}`;
  });
}

// Translates a segment's filters to SQL WHERE clauses and parameters
export function buildSegmentWhereClause(filters: any, columns: string[]) {
  const whereClauses: string[] = ['1=1'];
  const params: any[] = [];

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

  const {
    status,
    source,
    project,
    interest,
    startDate,
    endDate,
    search,
    activity,
    utmSource,
    utmMedium,
    utmCampaign,
    formId,
    adId,
    adName,
    ids
  } = filters;

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const idCol = findCol('id') || '"id"';
    params.push(ids);
    whereClauses.push(`${idCol} = ANY($${params.length})`);
  } else {
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

    if (interest) {
      const ratingCol = findCol('rating') || '"rating"';
      if (ratingCol && columns.includes(ratingCol.replace(/"/g, ''))) {
        params.push(interest);
        whereClauses.push(`${ratingCol} ILIKE $${params.length}`);
      }
    }

    if (utmSource && columns.includes((findCol('utmsource') || '"utmSource"').replace(/"/g, ''))) {
      params.push(utmSource);
      whereClauses.push(`${findCol('utmsource') || '"utmSource"'} ILIKE $${params.length}`);
    }

    if (utmMedium && columns.includes((findCol('utmmedium') || '"utmMedium"').replace(/"/g, ''))) {
      params.push(utmMedium);
      whereClauses.push(`${findCol('utmmedium') || '"utmMedium"'} ILIKE $${params.length}`);
    }

    if (utmCampaign && columns.includes((findCol('utmcampaign') || '"utmCampaign"').replace(/"/g, ''))) {
      params.push(utmCampaign);
      whereClauses.push(`${findCol('utmcampaign') || '"utmCampaign"'} ILIKE $${params.length}`);
    }

    if (formId && columns.includes((findCol('formid') || '"formId"').replace(/"/g, ''))) {
      params.push(formId);
      whereClauses.push(`${findCol('formid') || '"formId"'} = $${params.length}`);
    }

    if (adId && columns.includes((findCol('adid') || '"adId"').replace(/"/g, ''))) {
      params.push(adId);
      whereClauses.push(`${findCol('adid') || '"adId"'} = $${params.length}`);
    }

    if (adName && columns.includes((findCol('adname') || '"adName"').replace(/"/g, ''))) {
      params.push(`%${adName}%`);
      whereClauses.push(`${findCol('adname') || '"adName"'} ILIKE $${params.length}`);
    }

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

    if (startDate && createdAtCol) {
      const startParsed = new Date(startDate);
      if (!isNaN(startParsed.getTime())) {
        params.push(startParsed);
        whereClauses.push(`${createdAtCol} >= $${params.length}`);
      }
    }

    if (endDate && createdAtCol) {
      const endParsed = new Date(endDate);
      if (!isNaN(endParsed.getTime())) {
        endParsed.setHours(23, 59, 59, 999);
        params.push(endParsed);
        whereClauses.push(`${createdAtCol} <= $${params.length}`);
      }
    }
  }

  return {
    whereStr: whereClauses.join(' AND '),
    params
  };
}

// Queries existing leads matching a segment
export async function getLeadsForSegment(segmentId: string) {
  // 1. Get Segment
  const segRes = await queryMarketing('SELECT * FROM segments WHERE id = $1', [segmentId]);
  if (segRes.rowCount === 0) return [];
  const segment = segRes.rows[0];
  const filters = segment.filters;

  // 2. Discover Lead columns
  const columns = await getLeadColumns();

  // 3. Build query
  const { whereStr, params } = buildSegmentWhereClause(filters, columns);

  // We want to fetch columns: id, email, FirstName, LastName, Phone, formId, adName, pie, source, CreatedAt
  const findCol = (name: string) => {
    const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
    return match ? `"${match}"` : null;
  };

  const idCol = findCol('id') || '"id"';
  const emailCol = findCol('email') || '"Email"';
  const firstNameCol = findCol('firstname') || findCol('name') || '"FirstName"';
  const lastNameCol = findCol('lastname') || '"LastName"';
  const phoneCol = findCol('phone') || '"Phone"';
  const formIdCol = findCol('formid') || findCol('FormId') || '"FormId"';
  const adNameCol = findCol('adname') || findCol('AdName') || '"AdName"';
  const pieCol = findCol('pie') || '"pie"';
  const sourceCol = findCol('source') || '"Source"';
  const rawCreatedAtCol = findCol('createdat') || findCol('created_at') || findCol('created');
  const createdAtCol = rawCreatedAtCol || '"CreatedAt"';

  const selectFields = [
    `${idCol} as id`,
    `${emailCol} as email`,
    `${firstNameCol} as firstname`,
    `${lastNameCol} as lastname`,
    `${phoneCol} as phone`,
    columns.includes(formIdCol.replace(/"/g, '')) ? `${formIdCol} as formid` : 'NULL as formid',
    columns.includes(adNameCol.replace(/"/g, '')) ? `${adNameCol} as adname` : 'NULL as adname',
    columns.includes(pieCol.replace(/"/g, '')) ? `${pieCol} as pie` : 'NULL as pie',
    `${sourceCol} as source`,
    `${createdAtCol} as created_at`
  ].join(', ');

  const query = `
    SELECT ${selectFields}
    FROM "Lead"
    WHERE ${emailCol} IS NOT NULL AND ${emailCol} != '' AND ${whereStr}
    ORDER BY ${createdAtCol} DESC
  `;

  const leadsRes = await queryMain(query, params);
  return leadsRes.rows;
}

// Checks if a single lead matches a segment's criteria
export async function checkLeadMatchesSegment(leadId: string, segmentId: string): Promise<boolean> {
  try {
    const segRes = await queryMarketing('SELECT * FROM segments WHERE id = $1', [segmentId]);
    if (segRes.rowCount === 0) return false;
    const segment = segRes.rows[0];
    const filters = segment.filters;

    const columns = await getLeadColumns();
    const { whereStr, params } = buildSegmentWhereClause(filters, columns);

    const idCol = columns.find(c => c.toLowerCase() === 'id') || 'id';

    const shiftedWhereStr = shiftPlaceholders(whereStr, 1);
    const query = `
      SELECT "${idCol}" as id 
      FROM "Lead" 
      WHERE "${idCol}" = $1 AND ${shiftedWhereStr}
      LIMIT 1
    `;

    const res = await queryMain(query, [leadId, ...params]);
    return res.rows.length > 0;
  } catch (err) {
    console.error(`Error checking if lead matches segment ${segmentId}:`, err);
    return false;
  }
}

// Dispatches a single lead + campaigns to the special webhook and logs a notification
export async function dispatchLeadToWebhook(lead: any, rule: any, campaigns: any[]) {
  let specialWebhookUrl = rule.webhook_url;
  
  if (!specialWebhookUrl) {
    specialWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.aliminlomasdelmar.com/webhook/451ea8a2-a6d4-4827-9c6f-375ba8adcdd8';
  }

  const first = lead.firstname || lead.FirstName || '';
  const last = lead.lastname || lead.LastName || '';
  const fullName = `${first} ${last}`.trim() || lead.name || '';
  
  const payload = {
    lead: {
      id: lead.id,
      email: lead.email,
      name: fullName,
      phone: lead.phone || '',
      formid: lead.formid || '',
      adname: lead.adname || '',
      adid: lead.adid || '',
      pie: lead.pie || '',
      source: lead.source || 'META',
      created_at: lead.created_at || new Date().toISOString()
    },
    automation: {
      id: rule.id,
      name: rule.name
    },
    campaigns: campaigns.map(c => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      html_content: c.html_content,
      mjml_content: c.mjml_content
    }))
  };

  try {
    const res = await fetch(specialWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`[Automation Utility] Webhook sent for rule "${rule.name}", lead: ${lead.email}. Status: ${res.status}`);

    // Log notification in marketing DB
    const titleMsg = `Automatización: ${rule.name}`;
    const messageMsg = `Se enviaron ${campaigns.length} campaña(s) a n8n para el contacto ${fullName || lead.email}`;
    await queryMarketing(`
      INSERT INTO notifications (lead_id, email, event_type, title, message)
      VALUES ($1, $2, $3, $4, $5)
    `, [lead.id, lead.email, 'EMAIL_SENT', titleMsg, messageMsg]);

    return true;
  } catch (err) {
    console.error(`[Automation Utility] Error sending webhook for rule "${rule.name}", lead: ${lead.email}:`, err);
    return false;
  }
}

// Dispatches all existing leads matching the rule's segment in the background (non-blocking)
export async function dispatchExistingLeads(rule: any) {
  try {
    const segmentId = rule.segment_id;
    if (!segmentId) return;

    // 1. Get Campaign Details
    const campaignIds = Array.isArray(rule.campaign_ids)
      ? rule.campaign_ids
      : typeof rule.campaign_ids === 'string'
        ? JSON.parse(rule.campaign_ids)
        : [];

    if (campaignIds.length === 0) return;

    const campaignsRes = await queryMarketing(`
      SELECT id, title, subject, html_content, mjml_content 
      FROM campaigns 
      WHERE id = ANY($1::uuid[])
    `, [campaignIds]);
    const campaigns = campaignsRes.rows;

    if (campaigns.length === 0) return;

    // 2. Get Leads matching the segment
    const leads = await getLeadsForSegment(segmentId);
    console.log(`[Automation Utility] Starting background dispatch of ${leads.length} existing leads for rule "${rule.name}"...`);

    // 3. Dispatch asynchronously in the background
    setTimeout(async () => {
      let successCount = 0;
      for (const lead of leads) {
        try {
          const ok = await dispatchLeadToWebhook(lead, rule, campaigns);
          if (ok) successCount++;
          // Wait 100ms between dispatches to avoid overloading n8n / networks
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`[Automation Background Worker] Failed to dispatch lead ${lead.email}:`, err);
        }
      }
      console.log(`[Automation Background Worker] Finished dispatching for rule "${rule.name}". Successfully processed ${successCount}/${leads.length} leads.`);
    }, 0);

  } catch (error) {
    console.error(`[Automation Utility] Error initiating dispatch for rule "${rule.name}":`, error);
  }
}
