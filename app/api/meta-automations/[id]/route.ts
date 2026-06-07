import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { dispatchExistingLeads } from '@/lib/automation_utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    id: string;
  };
}

// PUT edit rule
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const id = params.id;
    const body = await request.json();
    const { name, form_id, segment_id, campaign_ids, active } = body;

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

    // 2. Perform the update
    const query = `
      UPDATE meta_automations
      SET name = $1, form_id = $2, segment_id = $3, campaign_ids = $4, active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    const queryParams = [name, form_id || null, segment_id || null, campaignIdsJson, isActive, id];

    const result = await queryMarketing(query, queryParams);
    const updatedRule = result.rows[0];

    // 3. Trigger immediate dispatch if newly activated, segment changed or campaigns changed
    const wasActivated = !oldRule.active && isActive;
    const segmentChanged = oldRule.segment_id !== segment_id;
    const campaignsChanged = JSON.stringify(oldRule.campaign_ids) !== campaignIdsJson;

    if (isActive && (wasActivated || segmentChanged || campaignsChanged) && segment_id) {
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
