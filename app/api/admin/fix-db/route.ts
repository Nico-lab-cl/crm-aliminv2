import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const results: string[] = [];

    // 1. Check if 'updated_at' exists
    const checkUpdatedAt = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'updated_at'
    `);

    if (checkUpdatedAt.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaigns 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      results.push("Added 'updated_at' column to campaigns table.");
    } else {
      results.push("'updated_at' column already exists.");
    }

    // 2. Check if 'name' exists
    const checkName = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'name'
    `);

    if (checkName.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaigns 
        ADD COLUMN name VARCHAR(255)
      `);
      // Update name with title for existing rows
      await queryMarketing(`UPDATE campaigns SET name = title WHERE name IS NULL`);
      // Make it NOT NULL
      await queryMarketing(`ALTER TABLE campaigns ALTER COLUMN name SET NOT NULL`);
      results.push("Added 'name' column to campaigns table and populated it with titles.");
    } else {
      results.push("'name' column already exists.");
    }

    // 3. Check if 'is_automation' exists (used in automation/route.ts)
    const checkAutomation = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'is_automation'
    `);

    if (checkAutomation.rows.length === 0) {
        await queryMarketing(`
          ALTER TABLE campaigns 
          ADD COLUMN is_automation BOOLEAN DEFAULT FALSE,
          ADD COLUMN automation_formid VARCHAR(255)
        `);
        results.push("Added 'is_automation' and 'automation_formid' columns to campaigns table.");
    }

    // 4. Check for 'created_at' in campaign_logs
    const checkLogsCreatedAt = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'created_at'
    `);

    if (checkLogsCreatedAt.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      results.push("Added 'created_at' column to campaign_logs table.");
    } else {
      results.push("Column 'created_at' already exists in campaign_logs.");
    }

    // 4b. Check for 'opened_at' in campaign_logs
    const checkLogsOpenedAt = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'opened_at'
    `);

    if (checkLogsOpenedAt.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN opened_at TIMESTAMP WITH TIME ZONE
      `);
      results.push("Added 'opened_at' column to campaign_logs table.");
    } else {
      results.push("Column 'opened_at' already exists in campaign_logs.");
    }

    // 4c. Check for 'last_callback_at' in campaign_logs
    const checkLogsLastCallbackAt = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'last_callback_at'
    `);

    if (checkLogsLastCallbackAt.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN last_callback_at TIMESTAMP WITH TIME ZONE
      `);
      results.push("Added 'last_callback_at' column to campaign_logs table.");
    } else {
      results.push("Column 'last_callback_at' already exists in campaign_logs.");
    }

    // 4d. Check for 'clicks' in campaign_logs
    const checkLogsClicks = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'clicks'
    `);

    if (checkLogsClicks.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN clicks INTEGER DEFAULT 0
      `);
      results.push("Added 'clicks' column to campaign_logs table.");
    } else {
      results.push("Column 'clicks' already exists in campaign_logs.");
    }

    // 4e. Check for 'last_clicked_at' in campaign_logs
    const checkLogsLastClickedAt = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'last_clicked_at'
    `);

    if (checkLogsLastClickedAt.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN last_clicked_at TIMESTAMP WITH TIME ZONE
      `);
      results.push("Added 'last_clicked_at' column to campaign_logs table.");
    } else {
      results.push("Column 'last_clicked_at' already exists in campaign_logs.");
    }

    // 4f. Check for 'is_test' in campaign_logs
    const checkLogsIsTest = await queryMarketing(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaign_logs' AND column_name = 'is_test'
    `);

    if (checkLogsIsTest.rows.length === 0) {
      await queryMarketing(`
        ALTER TABLE campaign_logs 
        ADD COLUMN is_test BOOLEAN DEFAULT FALSE
      `);
      results.push("Added 'is_test' column to campaign_logs table.");
    } else {
      results.push("Column 'is_test' already exists in campaign_logs.");
    }

    // 5. Check if 'segments' table exists
    const checkSegmentsTable = await queryMarketing(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'segments'
    `);

    if (checkSegmentsTable.rows.length === 0) {
      await queryMarketing(`
        CREATE TABLE segments (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          filters JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      results.push("Created 'segments' table.");
    } else {
      results.push("'segments' table already exists.");
    }

    // 6. Check if column 'pie' exists in "Lead" table in MAIN_DB
    try {
      const checkLeadPie = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead' AND column_name = 'pie'
      `);
      if (checkLeadPie.rows.length === 0) {
        await queryMain(`
          ALTER TABLE "Lead" 
          ADD COLUMN pie VARCHAR(255)
        `);
        results.push("Added 'pie' column to the 'Lead' table in Main DB.");
      } else {
        results.push("'pie' column already exists in 'Lead' table.");
      }
    } catch (e) {
      console.warn("Could not alter 'Lead' table in Main DB (using mock/offline?):", (e as Error).message);
      results.push("Main DB 'Lead' table pie check bypassed: " + (e as Error).message);
    }

    // 7. Check if 'lead_activities' table exists
    const checkLeadActivitiesTable = await queryMarketing(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'lead_activities'
    `);

    if (checkLeadActivitiesTable.rows.length === 0) {
      await queryMarketing(`
        CREATE TABLE lead_activities (
          id SERIAL PRIMARY KEY,
          lead_id UUID NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          page_url TEXT,
          page_title VARCHAR(255),
          details JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      results.push("Created 'lead_activities' table.");
    } else {
      results.push("'lead_activities' table already exists.");
    }

    // 8. Debug info for Lead table columns and date range counts
    try {
      const colsRes = await queryMain(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      const cols = colsRes.rows.map(r => `${r.column_name} (${r.data_type})`);
      results.push("Lead Columns in Main DB: " + cols.join(', '));

      const countRes = await queryMain('SELECT COUNT(*) as total FROM "Lead"');
      results.push("Total Leads in Main DB: " + countRes.rows[0].total);

      // Try searching for the creation date column
      const findCol = (name: string) => {
        const match = colsRes.rows.map(r => r.column_name).find(c => c.toLowerCase() === name.toLowerCase());
        return match ? `"${match}"` : null;
      };
      const rawCreatedAtCol = findCol('createdat') || findCol('created_at') || findCol('created');
      
      if (rawCreatedAtCol) {
        results.push(`Found creation date column: ${rawCreatedAtCol}`);
        
        // Count with specific range
        const testRangeRes = await queryMain(`
          SELECT COUNT(*) as total 
          FROM "Lead" 
          WHERE ${rawCreatedAtCol} >= $1 AND ${rawCreatedAtCol} <= $2
        `, [new Date('2025-10-01'), new Date('2026-05-31T23:59:59.999Z')]);
        results.push(`Leads created between 2025-10-01 and 2026-05-31: ${testRangeRes.rows[0].total}`);
        
        // Count before Oct 2025
        const testBeforeRes = await queryMain(`
          SELECT COUNT(*) as total 
          FROM "Lead" 
          WHERE ${rawCreatedAtCol} < $1
        `, [new Date('2025-10-01')]);
        results.push(`Leads created before 2025-10-01: ${testBeforeRes.rows[0].total}`);
      } else {
        results.push("No creation date column found in information_schema for table Lead.");
      }

    } catch (err) {
      results.push("Error debugging Lead table: " + (err as Error).message);
    }

    return NextResponse.json({
      success: true,
      message: "Database schema update check completed.",
      details: results
    });
  } catch (error) {
    console.error('Error fixing database:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({
      success: false,
      message: "Error updating database schema",
      error: errorMessage
    }, { status: 500 });
  }
}
