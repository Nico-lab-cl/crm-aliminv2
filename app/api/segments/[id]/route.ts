import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { MOCK_SEGMENTS } from '@/lib/mock_segments';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    let dbConnected = false;

    try {
      await queryMarketing('DELETE FROM segments WHERE id = $1', [id]);
      dbConnected = true;
    } catch (e) {
      console.warn('Error deleting segment in DB, using memory fallback:', (e as Error).message);
    }

    if (!dbConnected) {
      const index = MOCK_SEGMENTS.findIndex(s => s.id === id);
      if (index !== -1) {
        MOCK_SEGMENTS.splice(index, 1);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Segmento eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error in DELETE /api/segments/[id]:', error);
    return NextResponse.json(
      { message: 'Error al eliminar el segmento', error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, type, filters } = body;

    if (!name || !type || !filters) {
      return NextResponse.json(
        { message: 'Los campos name, type y filters son obligatorios.' },
        { status: 400 }
      );
    }

    let dbConnected = false;
    let updatedSegment = null;
    const updatedAt = new Date().toISOString();

    try {
      const query = `
        UPDATE segments 
        SET name = $1, type = $2, filters = $3, updated_at = $4 
        WHERE id = $5 
        RETURNING *
      `;
      const res = await queryMarketing(query, [
        name,
        type,
        JSON.stringify(filters),
        updatedAt,
        id
      ]);
      if (res.rows.length > 0) {
        updatedSegment = res.rows[0];
        dbConnected = true;
      }
    } catch (e) {
      console.warn('Error updating segment in DB, using memory fallback:', (e as Error).message);
    }

    if (!dbConnected) {
      const index = MOCK_SEGMENTS.findIndex(s => s.id === id);
      if (index !== -1) {
        MOCK_SEGMENTS[index] = {
          ...MOCK_SEGMENTS[index],
          name,
          type,
          filters,
          created_at: MOCK_SEGMENTS[index].created_at || new Date().toISOString()
        };
        updatedSegment = MOCK_SEGMENTS[index];
        dbConnected = true; // Simulado
      } else {
        return NextResponse.json({ message: 'Segmento no encontrado.' }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Segmento actualizado correctamente.',
      segment: updatedSegment
    });
  } catch (error) {
    console.error('Error in PUT /api/segments/[id]:', error);
    return NextResponse.json(
      { message: 'Error al actualizar el segmento', error: (error as Error).message },
      { status: 500 }
    );
  }
}
