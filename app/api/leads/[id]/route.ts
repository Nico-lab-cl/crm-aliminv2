import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { MOCK_LEADS } from '@/lib/mock_db';
import { retroactiveLinkLeads } from '@/lib/evolution_sync';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // 1. Intentar descubrir el esquema de la tabla Lead en la base de datos
    let columns: string[] = [];
    let dbConnected = false;
    
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map(r => r.column_name);
      dbConnected = columns.length > 0;
    } catch {
      console.warn('No se pudo conectar a la base de datos en PATCH /api/leads/[id], operando en modo simulado.');
    }

    // 2. Si no hay conexión o no hay datos, actualizar en el arreglo mock en memoria
    if (!dbConnected) {
      const lead = MOCK_LEADS.find(l => l.id === id);
      if (!lead) {
        return NextResponse.json({ message: 'Contacto no encontrado (simulado)' }, { status: 404 });
      }

      // Mapear campos actualizados del request body
      if (body.firstName !== undefined) lead.FirstName = body.firstName;
      if (body.FirstName !== undefined) lead.FirstName = body.FirstName;
      if (body.lastName !== undefined) lead.LastName = body.lastName;
      if (body.LastName !== undefined) lead.LastName = body.LastName;
      if (body.email !== undefined) lead.Email = body.email;
      if (body.Email !== undefined) lead.Email = body.Email;
      if (body.phone !== undefined) lead.Phone = body.phone;
      if (body.Phone !== undefined) lead.Phone = body.Phone;
      if (body.status !== undefined) lead.Status = body.status;
      if (body.Status !== undefined) lead.Status = body.Status;
      if (body.source !== undefined) lead.Source = body.source;
      if (body.Source !== undefined) lead.Source = body.Source;
      if (body.project !== undefined) lead.Project = body.project;
      if (body.Project !== undefined) lead.Project = body.Project;
      if (body.lote !== undefined) lead.Lote = body.lote;
      if (body.Lote !== undefined) lead.Lote = body.Lote;
      if (body.etapa !== undefined) lead.Etapa = body.etapa;
      if (body.Etapa !== undefined) lead.Etapa = body.Etapa;
      if (body.rating !== undefined) lead.Rating = body.rating;
      if (body.Rating !== undefined) lead.Rating = body.Rating;
      if (body.notes !== undefined) lead.notes = body.notes;
      if (body.Notes !== undefined) lead.notes = body.Notes;

      return NextResponse.json({
        success: true,
        message: 'Contacto actualizado en memoria (modo simulación)',
        lead
      });
    }

    // 3. Si hay conexión a la base de datos, construir consulta UPDATE dinámica
    const updateColumns: string[] = [];
    const values: unknown[] = [id]; // $1 será el ID

    const addField = (name: string, value: unknown) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      if (match && value !== undefined) {
        updateColumns.push(`"${match}" = $${values.length + 1}`);
        values.push(value);
      }
    };

    // Mapear campos del body dinámicamente según existan en el esquema
    addField('firstname', body.firstName ?? body.FirstName);
    addField('lastname', body.lastName ?? body.LastName);
    addField('email', body.email ?? body.Email);
    addField('phone', body.phone ?? body.Phone);
    addField('status', body.status ?? body.Status);
    addField('source', body.source ?? body.Source);
    addField('project', body.project ?? body.Project);
    addField('lote', body.lote ?? body.Lote);
    addField('etapa', body.etapa ?? body.Etapa);
    addField('rating', body.rating ?? body.Rating);
    addField('notes', body.notes ?? body.Notes);
    addField('lastactivity', body.lastActivity ?? body.lastactivity ?? body.LastActivity);
    addField('visited', body.visited);
    addField('visitdate', body.visitDate ?? body.visitdate);
    addField('visitproject', body.visitProject ?? body.visitproject);

    if (updateColumns.length === 0) {
      return NextResponse.json({ message: 'No se enviaron campos válidos para actualizar.' }, { status: 400 });
    }

    const idCol = columns.find(c => c.toLowerCase() === 'id') || 'id';
    const query = `
      UPDATE "Lead" 
      SET ${updateColumns.join(', ')} 
      WHERE "${idCol}" = $1
      RETURNING *
    `;

    const res = await queryMain(query, values);
    if (res.rowCount === 0) {
      return NextResponse.json({ message: 'Contacto no encontrado en la base de datos.' }, { status: 404 });
    }

    // Vincular mensajes huérfanos que coincidan si el teléfono fue actualizado
    try {
      await retroactiveLinkLeads();
    } catch (e) {
      console.warn('Error linking orphan WhatsApp messages on lead update:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Contacto actualizado correctamente en la base de datos.',
      lead: res.rows[0]
    });

  } catch (error) {
    console.error('Error in PATCH /api/leads/[id]:', error);
    return NextResponse.json(
      { message: 'Error interno al actualizar el contacto', error: (error as Error).message },
      { status: 500 }
    );
  }
}
