import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Datos de prueba simulados para desarrollo local sin base de datos activa
const MOCK_LEADS = [
  { id: '1', FirstName: 'José', LastName: 'Pérez', Email: 'jose.perez@gmail.com', Phone: '+56 9 8765 4321', Status: 'Nuevo', Source: 'META', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), Lote: 'A-12', Etapa: 'Etapa 1' },
  { id: '2', FirstName: 'María', LastName: 'López', Email: 'maria.lopez@yahoo.com', Phone: '+56 9 7654 3210', Status: 'Contactado', Source: 'Sitio Web', Project: 'Arena y Sol', CreatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(), Lote: 'B-04', Etapa: 'Etapa 2' },
  { id: '3', FirstName: 'Carlos', LastName: 'Valenzuela', Email: 'carlos.v@outlook.com', Phone: '+56 9 6543 2109', Status: 'Visita', Source: 'Referido', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(), Lote: 'C-22', Etapa: 'Etapa 1' },
  { id: '4', FirstName: 'Francisca', LastName: 'Silva', Email: 'fran.silva@gmail.com', Phone: '+56 9 5432 1098', Status: 'Nuevo', Source: 'META', Project: 'Arena y Sol', CreatedAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), Lote: 'A-02', Etapa: 'Etapa 3' },
  { id: '5', FirstName: 'Andrés', LastName: 'Muñoz', Email: 'andres.munoz@alimin.cl', Phone: '+56 9 4321 0987', Status: 'Contactado', Source: 'META', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), Lote: 'D-15', Etapa: 'Etapa 2' }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const source = searchParams.get('source') || '';
    const project = searchParams.get('project') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

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
    } catch (e) {
      console.warn('No se pudo conectar a la base de datos principal, usando datos simulados:', (e as Error).message);
    }

    // 2. Si no hay conexión o no hay datos, devolver datos simulados filtrados en memoria
    if (!dbConnected) {
      let filtered = [...MOCK_LEADS];
      
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(l => 
          l.FirstName.toLowerCase().includes(q) || 
          l.LastName.toLowerCase().includes(q) || 
          l.Email.toLowerCase().includes(q) || 
          l.Phone.includes(q)
        );
      }
      
      if (status) {
        filtered = filtered.filter(l => l.Status.toLowerCase() === status.toLowerCase());
      }
      if (source) {
        filtered = filtered.filter(l => l.Source.toLowerCase() === source.toLowerCase());
      }
      if (project) {
        filtered = filtered.filter(l => l.Project.toLowerCase() === project.toLowerCase());
      }

      const totalCount = filtered.length;
      const paginatedLeads = filtered.slice(offset, offset + limit);

      return NextResponse.json({
        leads: paginatedLeads,
        totalCount,
        page,
        limit,
        isMock: true
      });
    }

    // 3. Si hay conexión a la base de datos, construir consulta dinámica considerando mayúsculas/minúsculas
    const whereClauses: string[] = ['1=1'];
    const params: unknown[] = [];

    // Helper para buscar nombre exacto de la columna en la base de datos
    const findCol = (name: string) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      return match ? `"${match}"` : null;
    };

    const emailCol = findCol('email') || '"Email"';
    const firstNameCol = findCol('firstname') || findCol('name') || '"FirstName"';
    const lastNameCol = findCol('lastname') || '"LastName"';
    const phoneCol = findCol('phone') || '"Phone"';
    const statusCol = findCol('status') || '"Status"';
    const sourceCol = findCol('source') || '"Source"';
    const projectCol = findCol('project') || '"Project"';
    const createdAtCol = findCol('createdat') || findCol('created_at') || '"CreatedAt"';

    // Búsqueda por texto (Search)
    if (search) {
      params.push(`%${search}%`);
      const searchIdx = params.length;
      const searchTerms: string[] = [];
      
      if (columns.includes(emailCol.replace(/"/g, ''))) searchTerms.push(`${emailCol} ILIKE $${searchIdx}`);
      if (columns.includes(firstNameCol.replace(/"/g, ''))) searchTerms.push(`${firstNameCol} ILIKE $${searchIdx}`);
      if (columns.includes(lastNameCol.replace(/"/g, ''))) searchTerms.push(`${lastNameCol} ILIKE $${searchIdx}`);
      if (columns.includes(phoneCol.replace(/"/g, ''))) searchTerms.push(`${phoneCol} ILIKE $${searchIdx}`);
      
      if (searchTerms.length > 0) {
        whereClauses.push(`(${searchTerms.join(' OR ')})`);
      }
    }

    // Filtros específicos
    if (status && columns.includes(statusCol.replace(/"/g, ''))) {
      params.push(status);
      whereClauses.push(`${statusCol} ILIKE $${params.length}`);
    }
    if (source && columns.includes(sourceCol.replace(/"/g, ''))) {
      params.push(source);
      whereClauses.push(`${sourceCol} ILIKE $${params.length}`);
    }
    if (project && columns.includes(projectCol.replace(/"/g, ''))) {
      params.push(project);
      whereClauses.push(`${projectCol} ILIKE $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Consultar el conteo total
    const countRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].total, 10);

    // Consultar leads paginados y ordenados
    // Agregar paginación
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const selectQuery = `
      SELECT * 
      FROM "Lead" 
      WHERE ${whereStr} 
      ORDER BY ${columns.includes(createdAtCol.replace(/"/g, '')) ? createdAtCol : '1'} DESC NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const leadsRes = await queryMain(selectQuery, params);

    return NextResponse.json({
      leads: leadsRes.rows,
      totalCount,
      page,
      limit,
      isMock: false
    });

  } catch (error) {
    console.error('Error in GET /api/leads:', error);
    return NextResponse.json({ message: 'Error interno del servidor', error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, status, source, project, lote, etapa } = body;

    if (!email) {
      return NextResponse.json({ message: 'El correo electrónico (Email) es requerido.' }, { status: 400 });
    }

    // 1. Intentar descubrir el esquema
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
      console.warn('No se pudo conectar a la base de datos principal, operando en modo simulado.');
    }

    // 2. Si no hay base de datos, simular inserción exitosa
    if (!dbConnected) {
      const newLead = {
        id: Math.random().toString(36).substr(2, 9),
        FirstName: firstName || '',
        LastName: lastName || '',
        Email: email,
        Phone: phone || '',
        Status: status || 'Nuevo',
        Source: source || 'Manual',
        Project: project || '',
        Lote: lote || '',
        Etapa: etapa || '',
        CreatedAt: new Date().toISOString()
      };
      
      // Agregar temporalmente en memoria (para que el cliente lo vea en su sesión local)
      MOCK_LEADS.unshift(newLead);

      return NextResponse.json({
        success: true,
        message: 'Lead creado con éxito (modo simulación)',
        lead: newLead
      });
    }

    // 3. Si hay base de datos, mapear dinámicamente y hacer el INSERT
    const insertColumns: string[] = [];
    const values: unknown[] = [];
    const placeholders: string[] = [];

    // Helper de mapeo
    const addField = (name: string, value: unknown) => {
      const match = columns.find(c => c.toLowerCase() === name.toLowerCase());
      if (match && value !== undefined && value !== null) {
        insertColumns.push(`"${match}"`);
        values.push(value);
        placeholders.push(`$${values.length}`);
      }
    };

    addField('email', email);
    
    // Manejo de FirstName / LastName o Name unificado
    const nameCol = columns.find(c => c.toLowerCase() === 'name');
    if (nameCol) {
      const fullName = `${firstName || ''} ${lastName || ''}`.trim();
      addField('name', fullName);
    } else {
      addField('firstname', firstName);
      addField('lastname', lastName);
    }

    addField('phone', phone);
    addField('status', status || 'Nuevo');
    addField('source', source || 'Manual');
    addField('project', project || '');
    addField('lote', lote || '');
    addField('etapa', etapa || '');
    
    // Campos de tracking opcionales
    addField('created_at', new Date());
    addField('createdat', new Date());

    if (insertColumns.length === 0) {
      return NextResponse.json({ message: 'No se encontraron columnas mapeables en el esquema.' }, { status: 400 });
    }

    // Ejecutar INSERT con cláusula de conflicto en email
    const emailColName = columns.find(c => c.toLowerCase() === 'email') || 'Email';
    const updateClauses: string[] = [];
    
    insertColumns.forEach((col) => {
      if (col.replace(/"/g, '').toLowerCase() !== 'email') {
        updateClauses.push(`${col} = EXCLUDED.${col}`);
      }
    });

    const query = `
      INSERT INTO "Lead" (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT ("${emailColName}") DO UPDATE
      SET ${updateClauses.join(', ')}
      RETURNING *
    `;

    const res = await queryMain(query, values);

    return NextResponse.json({
      success: true,
      message: 'Contacto guardado correctamente en la base de datos.',
      lead: res.rows[0]
    });

  } catch (error) {
    console.error('Error in POST /api/leads:', error);
    return NextResponse.json({ message: 'Error al registrar contacto', error: (error as Error).message }, { status: 500 });
  }
}
