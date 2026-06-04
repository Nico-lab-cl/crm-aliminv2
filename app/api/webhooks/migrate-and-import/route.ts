import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Inspect columns of the "Lead" table
    const columnsRes = await queryMain(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);

    // Inspect the total number of leads
    const countRes = await queryMain('SELECT COUNT(*) as count FROM "Lead"');
    const totalLeads = parseInt(countRes.rows[0].count, 10);

    return NextResponse.json({
      success: true,
      message: 'Migration & Import endpoint is active.',
      totalLeads,
      columns: columnsRes.rows
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'migrate') {
      // 1. Alter Lead Table
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pie" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "monthlyPayment" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditInterest" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredChannel" VARCHAR(255)`);
      await queryMain(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "inboxUrl" TEXT`);

      // 2. Insert/Update Users
      const insertUsersQuery = `
        INSERT INTO "User" (id, name, username, role, password, "createdAt", "updatedAt") VALUES
        ('11111111-1111-1111-1111-111111111111', 'Orlando Costa', 'orlando.costa', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('22222222-2222-2222-2222-222222222222', 'Barbara Arias', 'barbara.arias', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('33333333-3333-3333-3333-333333333333', 'Marcela Escobar', 'marcela.escobar', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('44444444-4444-4444-4444-444444444444', 'Alimin', 'alimin', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('55555555-5555-5555-5555-555555555555', 'Cami Poblete Yout', 'cami.poblete', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('66666666-6666-6666-6666-666666666666', 'Cindy Gutierrez', 'cindy.gutierrez', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('77777777-7777-7777-7777-777777777777', 'S X G', 'sxg', 'ASESOR', 'placeholder_pw', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;
      await queryMain(insertUsersQuery);

      return NextResponse.json({ success: true, message: 'Database migrations and advisor setup executed successfully.' });
    }

    if (action === 'import') {
      const { leads, fields } = body;
      if (!Array.isArray(leads) || leads.length === 0) {
        return NextResponse.json({ error: 'Invalid or empty leads array' }, { status: 400 });
      }
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'Invalid or empty fields array' }, { status: 400 });
      }

      // We will perform a batch insert
      const valuePlaceholders: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      for (const lead of leads) {
        const rowPlaceholders: string[] = [];
        fields.forEach((field: string) => {
          rowPlaceholders.push(`$${paramIdx++}`);
          let val = lead[field];
          if (val === undefined || val === '') val = null;
          if (field === 'visited' || field === 'visitReminderSent1d' || field === 'visitReminderSent1h') {
            val = val || false;
          }
          if (field === 'status' && !val) {
            val = 'Nuevo';
          }
          params.push(val);
        });
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      // Check fields matching standard columns
      const updateClauses: string[] = [];
      fields.forEach((field: string) => {
        if (field !== 'id' && field !== 'email') {
          updateClauses.push(`"${field}" = COALESCE("Lead"."${field}", EXCLUDED."${field}")`);
        }
      });
      // Explicitly append tags and notes merge logic
      const tagsIndex = fields.indexOf('tags');
      const notesIndex = fields.indexOf('notes');

      if (tagsIndex !== -1) {
        const idx = fields.indexOf('tags');
        // Custom tag concatenation in conflict
        updateClauses[updateClauses.findIndex(c => c.startsWith('"tags" ='))] = 
          `tags = COALESCE("Lead".tags || ', ' || EXCLUDED.tags, EXCLUDED.tags)`;
      }
      if (notesIndex !== -1) {
        // Custom notes concatenation in conflict
        updateClauses[updateClauses.findIndex(c => c.startsWith('"notes" ='))] = 
          `notes = COALESCE("Lead".notes || '\n' || EXCLUDED.notes, EXCLUDED.notes)`;
      }

      const query = `
        INSERT INTO "Lead" (${fields.map(f => `"${f}"`).join(', ')})
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (email) DO UPDATE SET
          "firstName" = EXCLUDED."firstName",
          "lastName" = COALESCE("Lead"."lastName", EXCLUDED."lastName"),
          phone = COALESCE("Lead".phone, EXCLUDED.phone),
          city = COALESCE("Lead".city, EXCLUDED.city),
          ${updateClauses.join(', ')},
          "updatedAt" = NOW()
      `;

      await queryMain(query, params);
      return NextResponse.json({ success: true, count: leads.length });
    }

    if (action === 'clean_tags') {
      const query = `
        UPDATE "Lead"
        SET tags = (
          SELECT string_agg(DISTINCT trim(tag), ', ')
          FROM unnest(string_to_array(tags, ',')) AS tag
        )
        WHERE tags IS NOT NULL AND tags LIKE '%,%';
      `;
      const result = await queryMain(query);
      return NextResponse.json({ success: true, message: `Tags cleaned in ${result.rowCount} rows.` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
