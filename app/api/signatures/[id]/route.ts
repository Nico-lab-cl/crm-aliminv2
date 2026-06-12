import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

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
      WHERE s.id = $1
      GROUP BY s.id
    `, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Firma de correo no encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching signature by id:', error);
    return NextResponse.json(
      { error: 'Error al obtener la firma de correo.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const body = await request.json();
    const { name, personal_info, contact_info, social_links, styling, html_content, is_active } = body;

    if (!name || !html_content) {
      return NextResponse.json(
        { error: 'El nombre y el contenido HTML son obligatorios.' },
        { status: 400 }
      );
    }

    const result = await queryMarketing(`
      UPDATE email_signatures
      SET 
        name = $1, 
        personal_info = $2, 
        contact_info = $3, 
        social_links = $4, 
        styling = $5, 
        html_content = $6,
        is_active = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [
      name,
      JSON.stringify(personal_info || {}),
      JSON.stringify(contact_info || {}),
      JSON.stringify(social_links || {}),
      JSON.stringify(styling || {}),
      html_content,
      is_active !== undefined ? is_active : true,
      id
    ]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Firma de correo no encontrada para actualizar.' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating email signature:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la firma de correo.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const result = await queryMarketing(
      'DELETE FROM email_signatures WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Firma de correo no encontrada para eliminar.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Firma de correo eliminada correctamente.', id });
  } catch (error) {
    console.error('Error deleting email signature:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la firma de correo.' },
      { status: 500 }
    );
  }
}
