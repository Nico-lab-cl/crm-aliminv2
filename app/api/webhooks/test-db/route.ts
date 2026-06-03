import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report: any = {};

  // 0. Test server code version
  try {
    const filePath = path.join(process.cwd(), 'lib/evolution_sync.ts');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      report.serverCode = {
        path: filePath,
        lines: content.split('\n').length,
        phoneLine351: content.split('\n')[350] || 'out-of-bounds',
        phoneLine352: content.split('\n')[351] || 'out-of-bounds',
        phoneLine353: content.split('\n')[352] || 'out-of-bounds',
      };
    } else {
      report.serverCode = { exists: false, cwd: process.cwd() };
    }
  } catch (e: any) {
    report.serverCode = { error: e.message };
  }
  
  // 1. Test CRM Main DB
  try {
    const res = await queryMain('SELECT current_database(), version()');
    report.mainDb = {
      connected: true,
      db: res.rows[0].current_database,
      version: res.rows[0].version
    };
    
    // Check tables in Main DB
    const tables = await queryMain(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    report.mainDb.tables = tables.rows.map(r => r.table_name);
  } catch (e: any) {
    report.mainDb = { connected: false, error: e.message };
  }

  // 2. Test CRM Marketing DB
  try {
    const res = await queryMarketing('SELECT current_database()');
    report.marketingDb = {
      connected: true,
      db: res.rows[0].current_database
    };
    
    // Check if whatsapp_messages exists
    const columns = await queryMarketing(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_messages'
    `);
    report.marketingDb.whatsapp_messages_columns = columns.rows;
    
    const count = await queryMarketing('SELECT COUNT(*) FROM whatsapp_messages');
    report.marketingDb.whatsapp_messages_count = parseInt(count.rows[0].count);
    
    const latestMsgs = await queryMarketing('SELECT * FROM whatsapp_messages ORDER BY timestamp DESC LIMIT 5');
    report.marketingDb.latest_messages = latestMsgs.rows;
  } catch (e: any) {
    report.marketingDb = { connected: false, error: e.message };
  }

  // 3. Test Evolution DB
  const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';
  report.evolutionDbUrl = evolutionDbUrl.replace(/:[^:@]+@/, ':***@'); // hide password
  
  const pool = new Pool({
    connectionString: evolutionDbUrl,
    connectionTimeoutMillis: 5000,
  });
  
  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT current_database(), version()');
      report.evolutionDb = {
        connected: true,
        db: res.rows[0].current_database,
        version: res.rows[0].version
      };
      
      // List tables
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      report.evolutionDb.tables = tables.rows.map(r => r.table_name);
      
      // Check column names of Message table
      const msgTable = tables.rows.find(r => r.table_name.toLowerCase() === 'message');
      if (msgTable) {
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
        `, [msgTable.table_name]);
        report.evolutionDb.message_columns = columns.rows;
        
        // Count messages
        const count = await client.query(`SELECT COUNT(*) FROM "${msgTable.table_name}"`);
        report.evolutionDb.message_count = parseInt(count.rows[0].count);
        
        // Fetch 5 sample messages
        if (report.evolutionDb.message_count > 0) {
          const sample = await client.query(`SELECT * FROM "${msgTable.table_name}" LIMIT 5`);
          report.evolutionDb.sample_messages = sample.rows;
        }
      }

      // Check Contact table columns and samples
      const contactTable = tables.rows.find(r => r.table_name.toLowerCase() === 'contact');
      if (contactTable) {
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
        `, [contactTable.table_name]);
        report.evolutionDb.contact_columns = columns.rows;

        const count = await client.query(`SELECT COUNT(*) FROM "${contactTable.table_name}"`);
        report.evolutionDb.contact_count = parseInt(count.rows[0].count);

        if (report.evolutionDb.contact_count > 0) {
          const sample = await client.query(`SELECT * FROM "${contactTable.table_name}" LIMIT 10`);
          report.evolutionDb.sample_contacts = sample.rows;
        }
      }

      // Check Chat table columns and samples
      const chatTable = tables.rows.find(r => r.table_name.toLowerCase() === 'chat');
      if (chatTable) {
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
        `, [chatTable.table_name]);
        report.evolutionDb.chat_columns = columns.rows;

        const count = await client.query(`SELECT COUNT(*) FROM "${chatTable.table_name}"`);
        report.evolutionDb.chat_count = parseInt(count.rows[0].count);

        if (report.evolutionDb.chat_count > 0) {
          const sample = await client.query(`SELECT * FROM "${chatTable.table_name}" LIMIT 10`);
          report.evolutionDb.sample_chats = sample.rows;
        }
      }

    } finally {
      client.release();
    }
  } catch (e: any) {
    report.evolutionDb = { connected: false, error: e.message };
  } finally {
    await pool.end();
  }

  return NextResponse.json(report);
}
