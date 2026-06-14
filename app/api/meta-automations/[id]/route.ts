import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { dispatchExistingLeads } from '@/lib/automation_utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    id: string;
  };
}

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

// PUT edit rule
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await ensureSchema();
    
    const id = params.id;
    const body = await request.json();
    const { name, form_id, segment_id, campaign_ids, active, webhook_url } = body;

    if (!name || (!form_id && !segment_id)) {
      return NextResponse.json(
        { message: 'El nombre de la regla y al menos un ID de formulario o un segmento de interés son requeridos.' },
        { status: 400 }
      );
    }

    // 1. Get the current state of the rule to compare activation
    const oldRuleRes = await queryMarketing('SELECT * FROM meta_automations WHERE id = $1', [id]);
    if (oldRuleRes.rowCount === 0) {
      return NextResponse.json(
        { message: 'Regla de automatización no encontrada.' },
        { status: 404 }
      );
    }
    const oldRule = oldRuleRes.rows[0];

    const campaignIdsJson = JSON.stringify(campaign_ids || []);
    const isActive = active !== undefined ? active : true;
    const finalWebhookUrl = webhook_url !== undefined ? webhook_url : oldRule.webhook_url;

    // 2. Perform the update
    const query = `
      UPDATE meta_automations
      SET name = $1, form_id = $2, segment_id = $3, campaign_ids = $4, active = $5, webhook_url = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;
    const queryParams = [name, form_id || null, segment_id || null, campaignIdsJson, isActive, finalWebhookUrl || null, id];

    const result = await queryMarketing(query, queryParams);
    const updatedRule = result.rows[0];

    // 3. Trigger immediate dispatch if newly activated, segment changed, campaigns changed or webhook changed
    const wasActivated = !oldRule.active && isActive;
    const segmentChanged = oldRule.segment_id !== segment_id;
    const campaignsChanged = JSON.stringify(oldRule.campaign_ids) !== campaignIdsJson;
    const webhookUrlChanged = oldRule.webhook_url !== webhook_url;

    if (isActive && (wasActivated || segmentChanged || campaignsChanged || webhookUrlChanged) && segment_id) {
      dispatchExistingLeads(updatedRule).catch(err => {
        console.error('[API meta-automations PUT] Failed to trigger background dispatch:', err);
      });
    }

    return NextResponse.json(updatedRule);
  } catch (error) {
    console.error('Error updating meta-automation:', error);
    return NextResponse.json(
      { message: 'Error al actualizar la automatización de Meta', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE rule
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const id = params.id;
    const result = await queryMarketing('DELETE FROM meta_automations WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: 'Regla de automatización no encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Regla de automatización eliminada con éxito.' });
  } catch (error) {
    console.error('Error deleting meta-automation:', error);
    return NextResponse.json(
      { message: 'Error al eliminar la automatización de Meta', error: (error as Error).message },
      { status: 500 }
    );
  }
}
