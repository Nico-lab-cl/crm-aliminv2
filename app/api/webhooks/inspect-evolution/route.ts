import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';
  const pool = new Pool({ connectionString: evolutionDbUrl, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  
  try {
    // 1. Get all tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = tablesRes.rows.map(r => r.table_name);

    const msgTable = tables.find(t => t.toLowerCase() === 'message');

    if (msgTable) {
      console.log('Creating indexes on Evolution Message table...');
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_message_instanceId" ON "${msgTable}" ("instanceId")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_message_timestamp" ON "${msgTable}" ("messageTimestamp")`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_message_key_remoteJid" ON "${msgTable}" (("key"->>'remoteJid'))`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_message_key_remoteJidAlt" ON "${msgTable}" (("key"->>'remoteJidAlt'))`);
      console.log('Indexes created successfully.');
    }

    // Get updated indexes
    const indexesRes = await client.query(`
      SELECT
          i.relname as index_name,
          a.attname as column_name
      FROM
          pg_class t,
          pg_class i,
          pg_index ix,
          pg_attribute a
      WHERE
          t.oid = ix.indrelid
          and i.oid = ix.indexrelid
          and a.attrelid = t.oid
          and a.attnum = ANY(ix.indkey)
          and t.relkind = 'r'
          and t.relname = $1
    `, [msgTable]);

    return NextResponse.json({
      success: true,
      message: 'Indexes created/checked successfully',
      indexes: indexesRes.rows
    });

  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
