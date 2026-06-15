import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { dispatchLeadToWebhook } from '@/lib/automation_utils';

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
        WHERE id = ANY($1)
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

    // 4. Dispatch directly to webhook
    const ok = await dispatchLeadToWebhook(leadObj, rule, campaigns);

    if (ok) {
      return NextResponse.json({ success: true, message: 'Prueba enviada directamente al webhook de la regla.' });
    } else {
      return NextResponse.json({ message: 'Error al enviar webhook de prueba' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error running rule test:', error);
    return NextResponse.json({ message: 'Error interno en la prueba', error: (error as Error).message }, { status: 500 });
  }
}
