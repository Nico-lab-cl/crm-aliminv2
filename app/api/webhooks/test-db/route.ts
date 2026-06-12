import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';
  const pool = new Pool({ connectionString: evolutionDbUrl, connectionTimeoutMillis: 5000 });
  
  try {
    const client = await pool.connect();
    try {
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tablesList = tables.rows.map(r => r.table_name);
      
      // Let's also inspect columns of "Contact" if it exists
      let contactSchema = null;
      if (tablesList.includes('Contact') || tablesList.includes('contact')) {
        const tableName = tablesList.includes('Contact') ? 'Contact' : 'contact';
        const cols = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1
        `, [tableName]);
        
        const sample = await client.query(`SELECT * FROM "${tableName}" LIMIT 10`);
        contactSchema = {
          tableName,
          columns: cols.rows,
          sample: sample.rows
        };
      }
      
      // Also check if there is a table named "Chat" or similar
      let chatSchema = null;
      const chatTable = tablesList.find(t => t.toLowerCase() === 'chat');
      if (chatTable) {
        const cols = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1
        `, [chatTable]);
        
        const sample = await client.query(`SELECT * FROM "${chatTable}" LIMIT 10`);
        chatSchema = {
          tableName: chatTable,
          columns: cols.rows,
          sample: sample.rows
        };
      }

      return NextResponse.json({
        success: true,
        tables: tablesList,
        contactSchema,
        chatSchema
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  } finally {
    await pool.end();
  }
}
