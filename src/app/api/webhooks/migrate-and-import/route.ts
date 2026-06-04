import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    const expectedToken = process.env.ADMIN_PASSWORD || 'chris.2026';

    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Inspect columns of the "Lead" table
    const columnsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);

    // Inspect the total number of leads
    const countRes = await pool.query('SELECT COUNT(*) as count FROM "Lead"');
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
      await pool.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pie" VARCHAR(255)`);
      await pool.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "monthlyPayment" VARCHAR(255)`);
      await pool.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditInterest" VARCHAR(255)`);
      await pool.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredChannel" VARCHAR(255)`);
      await pool.query(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "inboxUrl" TEXT`);

      // 2. Insert/Update Users
      const insertUsersQuery = `
        INSERT INTO "User" (id, name, username, role, password, "createdAt", "updatedAt") VALUES
        ('44444444-4444-4444-4444-444444444444', 'Alimin', 'alimin', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('55555555-5555-5555-5555-555555555555', 'Cami Poblete Yout', 'cami.poblete', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('66666666-6666-6666-6666-666666666666', 'Cindy Gutierrez', 'cindy.gutierrez', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
        ('77777777-7777-7777-7777-777777777777', 'S X G', 'sxg', 'ASESOR', 'placeholder_pw', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `;
      await pool.query(insertUsersQuery);

      return NextResponse.json({ success: true, message: 'Database migrations and advisor setup executed successfully.' });
    }

    if (action === 'cleanup_advisors') {
      const mappings = [
        {
          duplicateId: '11111111-1111-1111-1111-111111111111', // Orlando Costa
          targetId: 'a6ce92ca-f1a1-4dcf-a042-fda1c31ca485'     // Orlando C
        },
        {
          duplicateId: '22222222-2222-2222-2222-222222222222', // Barbara Arias
          targetId: '77cea468-b4a5-44e6-aaa5-0a3f376affb1'     // Barbara A
        },
        {
          duplicateId: '33333333-3333-3333-3333-333333333333', // Marcela Escobar
          targetId: 'db1e6577-01b1-4615-b35e-0d50752452f3'     // Marcela E
        }
      ];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let totalLeadsMigrated = 0;

        for (const mapping of mappings) {
          // 1. Reassign Leads
          const leadRes = await client.query(
            'UPDATE "Lead" SET "assignedToId" = $1 WHERE "assignedToId" = $2',
            [mapping.targetId, mapping.duplicateId]
          );
          totalLeadsMigrated += leadRes.rowCount || 0;

          // 2. Reassign Reservations
          await client.query(
            'UPDATE "Reservation" SET "createdById" = $1 WHERE "createdById" = $2',
            [mapping.targetId, mapping.duplicateId]
          );

          // 3. Reassign Messages
          await client.query(
            'UPDATE "Message" SET "senderId" = $1 WHERE "senderId" = $2',
            [mapping.targetId, mapping.duplicateId]
          );

          // 4. Reassign Notifications
          await client.query(
            'UPDATE "Notification" SET "userId" = $1 WHERE "userId" = $2',
            [mapping.targetId, mapping.duplicateId]
          );

          // 5. Delete the duplicate User
          await client.query(
            'DELETE FROM "User" WHERE id = $1',
            [mapping.duplicateId]
          );
        }

        await client.query('COMMIT');

        // Send exactly one push notification to each target advisor
        const { createNotification } = await import('@/lib/notifications');
        let notificationsSent = 0;

        for (const mapping of mappings) {
          try {
            await createNotification({
              userId: mapping.targetId,
              title: "Carga de Clientes Históricos 📈",
              body: "Agregamos todos los clientes a nivel historico que estaban registrados, ahora tu base de datos es mayor",
              type: "ASSIGNMENT"
            });
            notificationsSent++;
          } catch (notifErr: any) {
            console.error(`Failed to send notification to user ${mapping.targetId}:`, notifErr.message);
          }
        }

        return NextResponse.json({
          success: true,
          message: 'Cleanup completed successfully.',
          leadsMigrated: totalLeadsMigrated,
          notificationsSent
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
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
        updateClauses[updateClauses.findIndex(c => c.startsWith('"tags" ='))] = 
          `tags = COALESCE("Lead".tags || ', ' || EXCLUDED.tags, EXCLUDED.tags)`;
      }
      if (notesIndex !== -1) {
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

      await pool.query(query, params);
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
      const result = await pool.query(query);
      return NextResponse.json({ success: true, message: `Tags cleaned in ${result.rowCount} rows.` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
