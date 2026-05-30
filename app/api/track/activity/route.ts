import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Manejador de preflight CORS (OPTIONS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Registro de actividad (POST)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lead_id, event_type, page_url, page_title, details } = body;

    if (!lead_id || !event_type) {
      return new NextResponse(
        JSON.stringify({ error: 'lead_id y event_type son requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const query = `
      INSERT INTO lead_activities (lead_id, event_type, page_url, page_title, details)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const res = await queryMarketing(query, [
      lead_id,
      event_type,
      page_url || '',
      page_title || '',
      JSON.stringify(details || {}),
    ]);

    return new NextResponse(
      JSON.stringify({ success: true, activity_id: res.rows[0].id }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error tracking lead activity:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Error al registrar actividad', message: (error as Error).message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
