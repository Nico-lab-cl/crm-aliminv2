import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

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
    const { name, form_id, campaign_ids, active } = body;

    if (!name || !form_id) {
      return NextResponse.json(
        { message: 'El nombre de la regla y el ID de formulario (form_id) son requeridos.' },
        { status: 400 }
      );
    }

    const campaignIdsJson = JSON.stringify(campaign_ids || []);

    const query = `
      UPDATE meta_automations
      SET name = $1, form_id = $2, campaign_ids = $3, active = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const queryParams = [name, form_id, campaignIdsJson, active !== undefined ? active : true, id];

    const result = await queryMarketing(query, queryParams);
    
    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: 'Regla de automatización no encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
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
