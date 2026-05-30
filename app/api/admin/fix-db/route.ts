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
