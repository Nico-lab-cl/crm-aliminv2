import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET all automations
export async function GET() {
  try {
    const res = await queryMarketing(`
      SELECT * FROM meta_automations 
      ORDER BY created_at DESC
    `);
    return NextResponse.json(res.rows);
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
      INSERT INTO meta_automations (name, form_id, campaign_ids, active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [name, form_id, campaignIdsJson, active !== undefined ? active : true];

    const result = await queryMarketing(query, params);
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating meta-automation:', error);
    return NextResponse.json(
      { message: 'Error al crear la automatización de Meta', error: (error as Error).message },
      { status: 500 }
    );
  }
}
