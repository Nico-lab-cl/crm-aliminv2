import { queryMarketing } from './lib/db';

async function inspect() {
  try {
    console.log('--- LATEST ACTIVITIES ---');
    const activities = await queryMarketing(`
      SELECT * FROM lead_activities 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log(activities.rows);

    console.log('\n--- LATEST NOTIFICATIONS ---');
    const notifications = await queryMarketing(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log(notifications.rows);
  } catch (e) {
    console.error('Inspection failed:', e);
  }
}

inspect();
