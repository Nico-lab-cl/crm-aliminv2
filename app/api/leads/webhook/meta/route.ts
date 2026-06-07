import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';
import { optimizeHtmlForDarkMode } from '@/lib/email_utils';
import { checkLeadMatchesSegment, dispatchLeadToWebhook } from '@/lib/automation_utils';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, phone, formid, adname, adName, pie, monto_pie, montoDePie, downpayment } = body;

    if (!email || !formid) {
      return NextResponse.json({ message: 'Email y FormID son requeridos' }, { status: 400 });
    }

    const resolvedAdName = adname || adName || '';
    const resolvedPie = pie || monto_pie || montoDePie || downpayment || '';

    // 1. Descubrir esquema de columnas en la tabla "Lead" de MAIN_DB
    let columns: string[] = [];
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map((r: { column_name: string }) => r.column_name);
    } catch (e) {
      console.warn('Error descubriendo esquema en webhook meta:', (e as Error).message);
    }

    const findCol = (colName: string) => {
      const match = columns.find(c => c.toLowerCase() === colName.toLowerCase());
      return match ? `"${match}"` : null;
    };

    const emailCol = findCol('email') || '"email"';
    const nameCol = findCol('name') || findCol('firstname') || '"name"';
    const phoneCol = findCol('phone') || '"phone"';
    const sourceCol = findCol('source') || '"source"';
    const formIdCol = findCol('formid') || '"formid"';
    const adNameCol = findCol('adname') || '"adname"';
    const pieCol = findCol('pie') || '"pie"';

    const insertCols = [emailCol, nameCol, phoneCol, sourceCol, formIdCol];
    const insertVals: (string | number | Date)[] = [email, name || '', phone || '', 'META', formid];

    if (resolvedAdName && columns.includes(adNameCol.replace(/"/g, ''))) {
      insertCols.push(adNameCol);
      insertVals.push(resolvedAdName);
    }
    if (resolvedPie && columns.includes(pieCol.replace(/"/g, ''))) {
      insertCols.push(pieCol);
      insertVals.push(resolvedPie);
    }

    const valuePlaceholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
    const updateSets = insertCols
      .filter(col => col !== emailCol)
      .map(col => {
        const rawCol = col.replace(/"/g, '');
        if (rawCol === 'pie') {
          return `${col} = CASE WHEN EXCLUDED.${col} IS NOT NULL AND EXCLUDED.${col} != '' THEN EXCLUDED.${col} ELSE "Lead".${col} END`;
        }
        return `${col} = EXCLUDED.${col}`;
      })
      .join(', ');

    const insertQuery = `
      INSERT INTO "Lead" (${insertCols.join(', ')})
      VALUES (${valuePlaceholders})
      ON CONFLICT (${emailCol}) DO UPDATE 
      SET ${updateSets}
    `;

    await queryMain(insertQuery, insertVals);

    // === NUEVA AUTOMATIZACIÓN CONFIGURABLE (WEBHOOK ESPECIAL) ===
    try {
      const leadIdRes = await queryMain('SELECT id FROM "Lead" WHERE email = $1 LIMIT 1', [email]);
      const leadId = leadIdRes.rows[0]?.id;

      if (leadId) {
        const activeRulesRes = await queryMarketing(`
          SELECT * FROM meta_automations 
          WHERE active = true
        `);

        console.log(`[Meta Webhook] Evaluando ${activeRulesRes.rowCount} automatizaciones activas para el nuevo lead.`);

        for (const rule of activeRulesRes.rows) {
          let matches = false;

          if (rule.segment_id) {
            matches = await checkLeadMatchesSegment(leadId, rule.segment_id);
          } else if (rule.form_id === formid) {
            matches = true;
          }

          if (matches) {
            console.log(`[Meta Webhook] El lead ${email} califica para la regla de automatización "${rule.name}"`);

            const campaignIds = Array.isArray(rule.campaign_ids)
              ? rule.campaign_ids
              : typeof rule.campaign_ids === 'string'
                ? JSON.parse(rule.campaign_ids)
                : [];

            if (campaignIds.length > 0) {
              const campaignsRes = await queryMarketing(`
                SELECT id, title, subject, html_content, mjml_content 
                FROM campaigns 
                WHERE id = ANY($1)
              `, [campaignIds]);
              
              if (campaignsRes.rows.length > 0) {
                const leadObj = {
                  id: leadId,
                  email,
                  firstname: name || '',
                  phone: phone || '',
                  formid,
                  adname: resolvedAdName,
                  pie: resolvedPie,
                  source: 'META',
                  created_at: new Date().toISOString()
                };

                dispatchLeadToWebhook(leadObj, rule, campaignsRes.rows).catch(err => {
                  console.error(`[Meta Webhook] Error al despachar webhook para la regla "${rule.name}":`, err);
                });
              }
            }
          }
        }
      }
    } catch (newAutoError) {
      console.error('[Meta Webhook] Error en el flujo de nueva automatización:', newAutoError);
    }

    // 2. Buscar si hay una campaña automatizada para este FormID (Flujo anterior)
    const campaignRes = await queryMarketing(`
      SELECT * FROM campaigns 
      WHERE is_automation = true 
      AND (automation_formid = $1 OR automation_formid LIKE '%' || $1 || '%')
      LIMIT 1
    `, [formid]);

    if (campaignRes.rowCount === 0) {
      return NextResponse.json({ message: 'Sin campaña automatizada para este FormID', formid });
    }

    const campaign = campaignRes.rows[0];

    // 3. Registrar el log como PROGRAMADO
    const scheduledAt = new Date(Date.now() + 5 * 60 * 1000); // +5 minutos
    const logRes = await queryMarketing(`
      INSERT INTO campaign_logs (campaign_id, email, status, scheduled_at, lead_id)
      VALUES ($1, $2, 'SCHEDULED', $3, (SELECT id FROM "Lead" WHERE email = $2 LIMIT 1))
      RETURNING id
    `, [campaign.id, email, scheduledAt]);

    const logId = logRes.rows[0].id;

    // 4. Iniciar el retraso y enviar (Lógica simple en memoria para este proyecto)
    // En producción idealmente esto sería un worker o un nodo 'Wait' en n8n
    setTimeout(async () => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const n8nUrl = process.env.N8N_WEBHOOK_URL;
        if (!n8nUrl) return;

        const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
        const finalHtml = optimizeHtmlForDarkMode(campaign.html_content + trackingPixel);

        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log_id: logId,
            campaign_id: campaign.id,
            email: email,
            name: name,
            phone: phone,
            subject: campaign.subject,
            html: finalHtml,
            formid: formid,
            source: 'META',
            automation: true
          }),
        });

        // Marcar como enviado
        await queryMarketing(
          "UPDATE campaign_logs SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1",
          [logId]
        );
      } catch (err) {
        console.error('Error en envío automatizado diferido:', err);
      }
    }, 5 * 60 * 1000);

    return NextResponse.json({ 
      success: true, 
      message: 'Lead recibido y correo programado para dentro de 5 minutos',
      campaign_title: campaign.title,
      scheduled_at: scheduledAt.toISOString()
    });

  } catch (error) {
    console.error('Error in Meta Webhook:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
