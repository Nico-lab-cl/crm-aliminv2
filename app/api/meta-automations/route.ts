import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { dispatchExistingLeads } from '@/lib/automation_utils';

export const dynamic = 'force-dynamic';

async function ensureSchema() {
  try {
    // 1. Create table if not exists
    await queryMarketing(`
      CREATE TABLE IF NOT EXISTS meta_automations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        form_id VARCHAR(255),
        segment_id VARCHAR(255),
        webhook_url VARCHAR(1000),
        campaign_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Add columns if they do not exist
    await queryMarketing(`
      ALTER TABLE meta_automations 
      ADD COLUMN IF NOT EXISTS segment_id VARCHAR(255)
    `);

    await queryMarketing(`
      ALTER TABLE meta_automations 
      ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(1000)
    `);

    // 3. Drop NOT NULL constraint on form_id
    try {
      await queryMarketing(`
        ALTER TABLE meta_automations 
        ALTER COLUMN form_id DROP NOT NULL
      `);
    } catch (err) {
      console.warn('Drop NOT NULL on form_id bypassed:', (err as Error).message);
    }
  } catch (error) {
    console.error('[ensureSchema] Error running on-the-fly migration:', error);
  }
}

// GET all automations
export async function GET() {
  try {
    await ensureSchema();
    
    const res = await queryMarketing(`
      SELECT * FROM meta_automations 
      ORDER BY created_at DESC
    `);
    
    const defaultWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.aliminlomasdelmar.com/webhook/451ea8a2-a6d4-4827-9c6f-375ba8adcdd8';
    
    return NextResponse.json(res.rows, {
      headers: {
        'x-default-webhook-url': defaultWebhookUrl
      }
    });
  } catch (error) {
    console.error('Error fetching meta-automations:', error);
    return NextResponse.json(
      { message: 'Error al obtener las automatizaciones de Meta', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST create a new automation rule
export async function POST(request: Request) {
  try {
    await ensureSchema();
    
    const body = await request.json();
    const { name, form_id, segment_id, campaign_ids, active, webhook_url } = body;

    if (!name || (!form_id && !segment_id)) {
      return NextResponse.json(
        { message: 'El nombre de la regla y al menos un ID de formulario o un segmento de interés son requeridos.' },
        { status: 400 }
      );
    }

    const campaignIdsJson = JSON.stringify(campaign_ids || []);
    const isActive = active !== undefined ? active : true;

    const query = `
      INSERT INTO meta_automations (name, form_id, segment_id, campaign_ids, active, webhook_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [name, form_id || null, segment_id || null, campaignIdsJson, isActive, webhook_url || null];

    const result = await queryMarketing(query, params);
    const newRule = result.rows[0];

    // Trigger immediate background dispatch for existing leads if active and has segment_id
    if (isActive && segment_id) {
      dispatchExistingLeads(newRule).catch(err => {
        console.error('[API meta-automations POST] Failed to trigger background dispatch:', err);
      });
    }

    return NextResponse.json(newRule);
  } catch (error) {
    console.error('Error creating meta-automation:', error);
    return NextResponse.json(
      { message: 'Error al crear la automatización de Meta', error: (error as Error).message },
      { status: 500 }
    );
  }
}
