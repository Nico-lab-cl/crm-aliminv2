import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const id = params.id;
    const ruleId = parseInt(id, 10);
    const body = await request.json();
    const { email, name, phone, formid, adname, adid, pie } = body;

    // 1. Get the rule (even if inactive)
    const ruleRes = await queryMarketing('SELECT * FROM meta_automations WHERE id = $1', [ruleId]);
    if (ruleRes.rowCount === 0) {
      return NextResponse.json({ message: 'Regla no encontrada' }, { status: 404 });
    }
    const rule = ruleRes.rows[0];

    // 2. Fetch the campaigns
    const campaignIds = Array.isArray(rule.campaign_ids)
      ? rule.campaign_ids
      : typeof rule.campaign_ids === 'string'
        ? JSON.parse(rule.campaign_ids)
        : [];

    let campaigns: any[] = [];
    if (campaignIds.length > 0) {
      const campaignsRes = await queryMarketing(`
        SELECT id, title, subject, html_content, mjml_content 
        FROM campaigns 
        WHERE id = ANY($1::uuid[])
      `, [campaignIds]);
      campaigns = campaignsRes.rows;
    }

    // 3. Build test lead object
    const leadObj = {
      id: '00000000-0000-0000-0000-000000000000',
      email: email || 'test_lead@alimin.cl',
      firstname: name || 'Juan Test Segmento',
      phone: phone || '+56999999999',
      formid: formid || rule.form_id || 'test-form',
      adname: adname || 'Test Ad Campaign',
      adid: adid || '1202078546301',
      pie: pie || '5.500.000 CLP',
      source: 'META_TEST',
      created_at: new Date().toISOString()
    };

    // 4. Dispatch directly to webhook in this route to catch details
    let specialWebhookUrl = rule.webhook_url;
    if (!specialWebhookUrl) {
      specialWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.aliminlomasdelmar.com/webhook/451ea8a2-a6d4-4827-9c6f-375ba8adcdd8';
    }

    const payload = {
      lead: {
        id: leadObj.id,
        email: leadObj.email,
        name: leadObj.firstname,
        phone: leadObj.phone,
        formid: leadObj.formid,
        adname: leadObj.adname,
        adid: leadObj.adid,
        pie: leadObj.pie,
        source: leadObj.source,
        created_at: leadObj.created_at
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

    let fetchStatus = 0;
    let fetchStatusText = '';
    let fetchErrorMsg = '';

    try {
      const res = await fetch(specialWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      fetchStatus = res.status;
      fetchStatusText = res.statusText;
    } catch (fetchErr) {
      fetchErrorMsg = (fetchErr as Error).message;
    }

    if (fetchErrorMsg) {
      return NextResponse.json({ 
        message: `Fallo al llamar al webhook: ${fetchErrorMsg}. URL intentada: ${specialWebhookUrl}` 
      }, { status: 500 });
    }

    if (fetchStatus >= 400) {
      return NextResponse.json({ 
        message: `El webhook respondió con código de error ${fetchStatus} (${fetchStatusText}). URL: ${specialWebhookUrl}` 
      }, { status: 500 });
    }

    // Log notification in marketing DB (try/catch to avoid breaking success response if DB log fails)
    try {
      const titleMsg = `Automatización (Prueba): ${rule.name}`;
      const messageMsg = `Se enviaron ${campaigns.length} campaña(s) de prueba a n8n para el contacto ${leadObj.firstname}`;
      await queryMarketing(`
        INSERT INTO notifications (lead_id, email, event_type, title, message)
        VALUES ($1, $2, $3, $4, $5)
      `, [leadObj.id, leadObj.email, 'EMAIL_SENT', titleMsg, messageMsg]);
    } catch (dbLogErr) {
      console.error('Error logging test notification to DB:', dbLogErr);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Prueba enviada correctamente al webhook. Código respuesta: ${fetchStatus} (${fetchStatusText})` 
    });

  } catch (error) {
    console.error('Error running rule test:', error);
    return NextResponse.json({ 
      message: 'Error interno en la prueba', 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
