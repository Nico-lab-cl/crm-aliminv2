import { queryMain, queryMarketing } from '@/lib/db';

// ============================================================
// Constants
// ============================================================
const GMAIL_DAILY_LIMIT = 2000;

// ============================================================
// In-Memory Job Tracker
// ============================================================
export interface BatchJob {
  id: string;
  campaignId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DAILY_LIMIT';
  totalLeads: number;
  processedLeads: number;
  sentBatches: number;
  totalBatches: number;
  failedLeads: number;
  skippedLeads: number;  // leads not sent due to daily limit
  batchSize: number;
  delayMs: number;
  dailyLimit: number;
  dailyUsedBefore: number;  // how many were already sent today before this job
  dailyRemaining: number;   // quota remaining when job started
  startedAt: Date;
  completedAt: Date | null;
  errors: string[];
  currentBatchIndex: number;
}

// Store running jobs in memory (survives within the same process)
const activeJobs = new Map<string, BatchJob>();

export function getJob(jobId: string): BatchJob | undefined {
  return activeJobs.get(jobId);
}

export function getAllJobs(): BatchJob[] {
  return Array.from(activeJobs.values()).sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
  );
}

export function cancelJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (job && (job.status === 'RUNNING' || job.status === 'QUEUED')) {
    job.status = 'CANCELLED';
    return true;
  }
  return false;
}

/**
 * Check how many emails were sent today (UTC) via campaign_logs
 */
export async function getTodaySentCount(): Promise<number> {
  try {
    const res = await queryMarketing(`
      SELECT COUNT(*) as count 
      FROM campaign_logs 
      WHERE status IN ('SENT', 'PENDING') 
        AND sent_at >= CURRENT_DATE
    `);
    return parseInt(res.rows[0]?.count || '0', 10);
  } catch {
    // If table doesn't exist or query fails, assume 0
    return 0;
  }
}

// ============================================================
// Batch Execution Engine
// ============================================================

interface BatchExecuteOptions {
  campaignId: string;
  leadFilters?: Record<string, unknown>;
  advancedFilters?: Array<{ column: string; operator: string; value: string }>;
  dateRange?: { start?: string; end?: string };
  batchSize?: number;    // default 50
  delayMs?: number;      // delay between batches in ms, default 5000
  dailyLimit?: number;   // default 2000 (Gmail Workspace)
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Starts a batch campaign execution in the background.
 * Returns a jobId immediately so the UI can poll for progress.
 * Respects daily sending limits.
 */
export async function startBatchExecution(options: BatchExecuteOptions): Promise<{ 
  jobId: string; 
  totalLeads: number;
  dailyUsed: number;
  dailyRemaining: number;
  willSend: number;
}> {
  const { 
    campaignId, 
    leadFilters, 
    advancedFilters, 
    dateRange, 
    batchSize = 50, 
    delayMs = 5000,
    dailyLimit = GMAIL_DAILY_LIMIT,
  } = options;

  // 1. Check daily quota
  const dailyUsed = await getTodaySentCount();
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  if (dailyRemaining === 0) {
    throw new Error(`Límite diario de ${dailyLimit} emails alcanzado. Ya se enviaron ${dailyUsed} emails hoy. Intenta mañana.`);
  }

  // 2. Get the campaign
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  // 3. Discover schema columns dynamically
  let columns: string[] = [];
  try {
    const schemaRes = await queryMain(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    columns = schemaRes.rows.map((r: { column_name: string }) => r.column_name);
  } catch (e) {
    console.warn('Error descubriendo esquema en batch engine:', e);
  }

  const findCol = (name: string) => {
    const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
    return match ? `"${match}"` : null;
  };

  // 4. Build dynamic WHERE clause
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

  const whereClauses = [`${emailCol} IS NOT NULL AND ${emailCol} != ''`];
  const params: (string | number | Date | string[])[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtersAny = leadFilters as any;

  if (filtersAny?.ids && Array.isArray(filtersAny.ids)) {
    params.push(filtersAny.ids);
    whereClauses.push(`${idCol} = ANY($${params.length})`);
  } else {
    if (filtersAny?.status && columns.includes(statusCol.replace(/"/g, ''))) {
      params.push(filtersAny.status);
      whereClauses.push(`${statusCol} ILIKE $${params.length}`);
    }
    if (filtersAny?.source && columns.includes(sourceCol.replace(/"/g, ''))) {
      const srcLower = filtersAny.source.toLowerCase();
      if (srcLower === 'sitio web' || srcLower === 'web' || srcLower === 'aliminspa.cl') {
        whereClauses.push(`(${sourceCol} ILIKE 'web' OR ${sourceCol} ILIKE 'Sitio Web' OR ${sourceCol} ILIKE 'Sitio web' OR ${sourceCol} ILIKE '%aliminspa%')`);
      } else {
        params.push(filtersAny.source);
        whereClauses.push(`${sourceCol} ILIKE $${params.length}`);
      }
    }
    if (filtersAny?.project && columns.includes(projectCol.replace(/"/g, ''))) {
      params.push(filtersAny.project);
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

    // Activity filters
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
        if (clauses.length > 0) whereClauses.push(`(${clauses.join(' OR ')})`);
      } else if (act === 'visit') {
        const colVis = findCol('visited') || '"visited"';
        const colVisProj = findCol('visitproject') || '"visitProject"';
        const colVisDate = findCol('visitdate') || '"visitDate"';
        const clauses: string[] = [];
        if (columns.includes(colVis.replace(/"/g, ''))) clauses.push(`${colVis} = true`);
        if (columns.includes(colVisProj.replace(/"/g, ''))) clauses.push(`${colVisProj} IS NOT NULL`);
        if (columns.includes(colVisDate.replace(/"/g, ''))) clauses.push(`${colVisDate} IS NOT NULL`);
        if (clauses.length > 0) whereClauses.push(`(${clauses.join(' OR ')})`);
      } else if (act === 'reservation') {
        const colStat = findCol('status') || '"Status"';
        const colSign = findCol('signingstatus') || '"signingStatus"';
        let clauses = `${colStat} ILIKE 'Reservado'`;
        if (columns.includes(colSign.replace(/"/g, ''))) clauses += ` OR ${colSign} IS NOT NULL`;
        whereClauses.push(`(${clauses})`);
      }
    }

    // Date filters from segment
    if (filtersAny?.startDate && rawCreatedAtCol) {
      params.push(new Date(filtersAny.startDate));
      whereClauses.push(`${createdAtCol} >= $${params.length}`);
    }
    if (filtersAny?.endDate && rawCreatedAtCol) {
      const end = new Date(filtersAny.endDate);
      end.setHours(23, 59, 59, 999);
      params.push(end);
      whereClauses.push(`${createdAtCol} <= $${params.length}`);
    }
  }

  // Advanced filters
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

  // Date range
  if (dateRange?.start && rawCreatedAtCol) {
    params.push(new Date(dateRange.start));
    whereClauses.push(`${createdAtCol} >= $${params.length}`);
  }
  if (dateRange?.end && rawCreatedAtCol) {
    const endDateVal = new Date(dateRange.end);
    endDateVal.setHours(23, 59, 59, 999);
    params.push(endDateVal);
    whereClauses.push(`${createdAtCol} <= $${params.length}`);
  }

  const whereString = whereClauses.join(' AND ');
  const leadQuery = `
    SELECT DISTINCT ON (${emailCol}) ${idCol} as id, ${emailCol} as email${columns.includes(firstNameCol.replace(/"/g, '')) ? `, ${firstNameCol} as firstname` : ''}
    FROM "Lead" 
    WHERE ${whereString} 
    ORDER BY ${emailCol}, ${rawCreatedAtCol ? createdAtCol : '1'} DESC
  `;

  const leadsRes = await queryMain(leadQuery, params);
  const allLeads = leadsRes.rows;

  if (allLeads.length === 0) {
    throw new Error('No se encontraron leads con los filtros seleccionados');
  }

  // Obtener correos enviados/pendientes para esta campaña desde la DB de Marketing
  let sentEmails = new Set<string>();
  if (campaignId) {
    try {
      const logsRes = await queryMarketing(
        `SELECT email FROM campaign_logs WHERE campaign_id = $1 AND status IN ('SENT', 'PENDING')`,
        [campaignId]
      );
      sentEmails = new Set(logsRes.rows.map((r: { email: string }) => r.email.toLowerCase()));
    } catch (err) {
      console.warn('Error fetching campaign logs for exclusion in batch execution:', err);
    }
  }

  // Filtrar leads que no han recibido la campaña aún
  const unsentLeads = campaignId
    ? allLeads.filter((l: { email?: string }) => !sentEmails.has((l.email || '').toLowerCase()))
    : allLeads;

  if (unsentLeads.length === 0) {
    throw new Error('Todos los leads calificados para este segmento ya han recibido esta campaña.');
  }

  // 5. Cap leads to daily remaining quota
  const leadsToSend = unsentLeads.slice(0, dailyRemaining);
  const skippedCount = unsentLeads.length - leadsToSend.length;

  // 6. Create the job
  const jobId = generateJobId();
  const totalBatches = Math.ceil(leadsToSend.length / batchSize);

  const job: BatchJob = {
    id: jobId,
    campaignId,
    status: 'QUEUED',
    totalLeads: unsentLeads.length,
    processedLeads: 0,
    sentBatches: 0,
    totalBatches,
    failedLeads: 0,
    skippedLeads: skippedCount,
    batchSize,
    delayMs,
    dailyLimit,
    dailyUsedBefore: dailyUsed,
    dailyRemaining,
    startedAt: new Date(),
    completedAt: null,
    errors: [],
    currentBatchIndex: 0,
  };

  activeJobs.set(jobId, job);

  // 7. Start background processing (fire-and-forget)
  processBatches(job, leadsToSend, campaign).catch(err => {
    console.error(`[BatchEngine] Fatal error in job ${jobId}:`, err);
    job.status = 'FAILED';
    job.errors.push(`Fatal: ${err.message}`);
    job.completedAt = new Date();
  });

  return { 
    jobId, 
    totalLeads: allLeads.length, 
    dailyUsed, 
    dailyRemaining,
    willSend: leadsToSend.length,
  };
}

// ============================================================
// Background Batch Processor
// ============================================================

async function processBatches(
  job: BatchJob,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leads: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campaign: any
) {
  job.status = 'RUNNING';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing.aliminspa.cl';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) {
    job.status = 'FAILED';
    job.errors.push('N8N_WEBHOOK_URL no configurada');
    job.completedAt = new Date();
    return;
  }

  // Split leads into batches
  const batches: typeof leads[] = [];
  for (let i = 0; i < leads.length; i += job.batchSize) {
    batches.push(leads.slice(i, i + job.batchSize));
  }

  console.log(`[BatchEngine] Job ${job.id}: Starting ${batches.length} batches of ${job.batchSize} leads (sending: ${leads.length}, skipped: ${job.skippedLeads})`);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    // Check for cancellation (cast to string to prevent TS control flow narrowing to RUNNING)
    if ((job.status as string) === 'CANCELLED') {
      console.log(`[BatchEngine] Job ${job.id}: Cancelled at batch ${batchIdx + 1}/${batches.length}`);
      job.completedAt = new Date();
      return;
    }

    const batch = batches[batchIdx];
    job.currentBatchIndex = batchIdx + 1;

    console.log(`[BatchEngine] Job ${job.id}: Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} leads)`);

    // Process each lead in the batch sequentially
    for (const lead of batch) {
      if ((job.status as string) === 'CANCELLED') break;

      try {
        const emailValue = lead.email || lead.Email;
        if (!emailValue) {
          job.failedLeads++;
          job.processedLeads++;
          continue;
        }

        // Create campaign log
        const logRes = await queryMarketing(
          `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
           VALUES ($1, $2, $3, 'PENDING') RETURNING id`,
          [job.campaignId, lead.id, emailValue]
        );
        const logId = logRes.rows[0].id;

        // Build final HTML with tracking pixel and link click tracking
        const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
        const htmlWithTrackedLinks = rewriteHtmlLinks(campaign.html_content, logId, appUrl);
        const finalHtml = htmlWithTrackedLinks + trackingPixel;

        // Send to n8n webhook
        const response = await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log_id: logId,
            campaign_id: job.campaignId,
            title: campaign.title,
            email: emailValue,
            subject: campaign.subject,
            html: finalHtml,
            design: campaign.mjml_content,
          }),
        });

        if (response.ok) {
          await queryMarketing(
            'UPDATE campaign_logs SET status = \'SENT\', sent_at = CURRENT_TIMESTAMP WHERE id = $1',
            [logId]
          );
        } else {
          await queryMarketing(
            'UPDATE campaign_logs SET status = \'FAILED\' WHERE id = $1',
            [logId]
          );
          job.failedLeads++;
          job.errors.push(`Lead ${emailValue}: HTTP ${response.status}`);
        }

        job.processedLeads++;
      } catch (error) {
        job.failedLeads++;
        job.processedLeads++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        job.errors.push(`Lead ${lead.email}: ${msg}`);
        console.error(`[BatchEngine] Error processing lead:`, error);
      }

      // Esperar 2 segundos entre cada envío individual para evitar límites de concurrencia en Gmail
      if ((job.status as string) === 'RUNNING') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    job.sentBatches = batchIdx + 1;

    // Wait between batches (except after the last one)
    if (batchIdx < batches.length - 1 && (job.status as string) === 'RUNNING') {
      console.log(`[BatchEngine] Job ${job.id}: Waiting ${job.delayMs}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, job.delayMs));
    }
  }

  // Final status
  if ((job.status as string) === 'RUNNING') {
    if (job.skippedLeads > 0) {
      job.status = 'DAILY_LIMIT';
    } else {
      job.status = 'COMPLETED';
    }
  }
  job.completedAt = new Date();
  console.log(`[BatchEngine] Job ${job.id}: Finished. Sent: ${job.processedLeads - job.failedLeads}, Failed: ${job.failedLeads}, Skipped (daily limit): ${job.skippedLeads}`);
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
