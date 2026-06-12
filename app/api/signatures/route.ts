import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await queryMarketing(`
      SELECT 
        s.id, 
        s.name, 
        s.personal_info, 
        s.contact_info, 
        s.social_links, 
        s.styling, 
        s.html_content,
        s.created_at, 
        s.updated_at, 
        s.is_active,
        COALESCE(COUNT(c.id), 0)::int as total_clicks
      FROM email_signatures s
      LEFT JOIN signature_clicks c ON s.id = c.signature_id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching email signatures:', error);
    return NextResponse.json(
      { error: 'Error al obtener las firmas de correo.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, personal_info, contact_info, social_links, styling, html_content } = body;

    if (!name || !html_content) {
      return NextResponse.json(
        { error: 'El nombre y el contenido HTML son campos obligatorios.' },
        { status: 400 }
      );
    }

    const result = await queryMarketing(`
      INSERT INTO email_signatures (
        name, 
        personal_info, 
        contact_info, 
        social_links, 
        styling, 
        html_content
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      name,
      JSON.stringify(personal_info || {}),
      JSON.stringify(contact_info || {}),
      JSON.stringify(social_links || {}),
      JSON.stringify(styling || {}),
      html_content
    ]);

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating email signature:', error);
    return NextResponse.json(
      { error: 'Error al crear la firma de correo.' },
      { status: 500 }
    );
  }
}
