import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { Pool } from 'pg';

const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';

export const dynamic = 'force-dynamic';

export async function GET() {
  const evolutionPool = new Pool({
    connectionString: evolutionDbUrl,
    connectionTimeoutMillis: 5000
  });

  try {
    const stats: any = {};

    // 1. Evolution DB stats
    try {
      const tablesRes = await evolutionPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const tables = tablesRes.rows.map(r => r.table_name);
      
      const msgTable = tables.find(t => t.toLowerCase() === 'message');
      if (msgTable) {
        const countRes = await evolutionPool.query(`SELECT COUNT(*) FROM "${msgTable}"`);
        stats.evolutionMessagesCount = parseInt(countRes.rows[0].count);

        const countByInstance = await evolutionPool.query(`
          SELECT "instanceId", COUNT(*)::int as count 
          FROM "${msgTable}" 
          GROUP BY "instanceId" 
          ORDER BY count DESC
        `);
        stats.evolutionMessagesByInstance = countByInstance.rows;
      }

      const instTable = tables.find(t => t.toLowerCase() === 'instance');
      if (instTable) {
        const instances = await evolutionPool.query(`SELECT id, name, status FROM "${instTable}"`);
        stats.evolutionInstances = instances.rows;
      }
    } catch (err: any) {
      stats.evolutionDbError = err.message;
    }

    // 2. Marketing DB stats
    try {
      const countRes = await queryMarketing('SELECT COUNT(*) FROM whatsapp_messages');
      stats.marketingMessagesCount = parseInt(countRes.rows[0].count);

      const countByAdvisor = await queryMarketing(`
        SELECT advisor_name, COUNT(*)::int as count 
        FROM whatsapp_messages 
        GROUP BY advisor_name 
        ORDER BY count DESC
      `);
      stats.marketingMessagesByAdvisor = countByAdvisor.rows;

      const countByInstance = await queryMarketing(`
        SELECT instance_id, COUNT(*)::int as count 
        FROM whatsapp_messages 
        GROUP BY instance_id 
        ORDER BY count DESC
      `);
      stats.marketingMessagesByInstance = countByInstance.rows;
    } catch (err: any) {
      stats.marketingDbError = err.message;
    }

    // 3. Main DB Lead Stats
    try {
      const leadCount = await queryMain('SELECT COUNT(*) FROM "Lead"');
      stats.crmLeadsCount = parseInt(leadCount.rows[0].count);

      const leadsByAdvisor = await queryMain(`
        SELECT u.name as advisor_name, COUNT(*)::int as count
        FROM "Lead" l
        LEFT JOIN "User" u ON l."assignedToId" = u.id
        GROUP BY u.name
        ORDER BY count DESC
      `);
      stats.crmLeadsByAdvisor = leadsByAdvisor.rows;

      const users = await queryMain('SELECT id, name, username, role FROM "User"');
      stats.crmUsers = users.rows;
    } catch (err: any) {
      stats.crmDbError = err.message;
    }

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    });
  } finally {
    await evolutionPool.end();
  }
}
