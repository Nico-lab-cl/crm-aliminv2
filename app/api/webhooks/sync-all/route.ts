import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

// URL de la base de datos de Evolution API (N8N)
const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';

export async function GET() {
  try {
    // 1. Consultar estadísticas de la tabla local whatsapp_messages
    const advisorStats = await queryMarketing(`
      SELECT advisor_name, COUNT(*) as count, MAX(timestamp) as last_message
      FROM whatsapp_messages
      GROUP BY advisor_name
      ORDER BY count DESC
    `);

    const instanceStats = await queryMarketing(`
      SELECT instance_id, COUNT(*) as count, MAX(timestamp) as last_message
      FROM whatsapp_messages
      GROUP BY instance_id
      ORDER BY count DESC
    `);

    // 2. Consultar instancias en la base de datos de Evolution
    let evolutionInstances: any[] = [];
    let evolutionMessageStats: any[] = [];
    let evolutionPool: Pool | null = null;
    
    try {
      evolutionPool = new Pool({
        connectionString: evolutionDbUrl,
        connectionTimeoutMillis: 5000,
      });

      const instRes = await evolutionPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND (table_name = 'Instance' OR table_name = 'instance')
      `);

      if (instRes.rows.length > 0) {
        const tableName = instRes.rows[0].table_name;
        const instancesRes = await evolutionPool.query(`SELECT * FROM "${tableName}"`);
        evolutionInstances = instancesRes.rows;
      }

      // Consultar mensajes en la base de datos de Evolution agrupados por instanceId
      const msgTableCheck = await evolutionPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND (table_name = 'Message' OR table_name = 'message')
      `);

      if (msgTableCheck.rows.length > 0) {
        const msgTable = msgTableCheck.rows[0].table_name;
        
        // Obtener el nombre de la columna para instanceId
        const colsRes = await evolutionPool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
        `, [msgTable]);
        const cols = colsRes.rows.map(r => r.column_name);
        const instanceCol = cols.find(c => ['instanceId', 'instance_id', 'instanceid'].includes(c)) || 'instanceId';

        const msgStatsRes = await evolutionPool.query(`
          SELECT "${instanceCol}" as instance_id, COUNT(*) as count 
          FROM "${msgTable}"
          GROUP BY "${instanceCol}"
        `);
        evolutionMessageStats = msgStatsRes.rows;
      }

    } catch (e: any) {
      console.error('[Sync All Webhook] Evolution DB Query error:', e.message);
    } finally {
      if (evolutionPool) {
        await evolutionPool.end();
      }
    }

    return NextResponse.json({
      success: true,
      local: {
        advisors: advisorStats.rows,
        instances: instanceStats.rows
      },
      evolution: {
        instances: evolutionInstances.map(i => ({ id: i.id || i.instanceId, name: i.name || i.instanceName })),
        messageStats: evolutionMessageStats
      }
    });
  } catch (error: any) {
    console.error('[Sync All Webhook] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
