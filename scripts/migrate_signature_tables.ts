import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function migrate() {
  let marketingDbUrl = process.env.MARKETING_DB_URL;

  if (!marketingDbUrl) {
    console.log('No MARKETING_DB_URL found in process.env, loading from .env.local...');
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^MARKETING_DB_URL=(.+)$/m);
        if (match) {
          marketingDbUrl = match[1].trim();
          console.log('Loaded MARKETING_DB_URL from .env.local:', marketingDbUrl.replace(/:[^:@]+@/, ':***@'));
        }
      }
    } catch (e) {
      console.warn('Error reading .env.local:', e);
    }
  }

  // Fallbacks
  const connections = [];
  if (marketingDbUrl) {
    connections.push({ name: 'Configured DB', url: marketingDbUrl });
    
    if (marketingDbUrl.includes('n8n_db-crm')) {
      const localUrl = marketingDbUrl.replace('n8n_db-crm', 'localhost');
      connections.push({ name: 'Configured DB (Localhost fallback)', url: localUrl });
    }
  }
  
  connections.push({
    name: 'Localhost crm_marketing',
    url: 'postgresql://nicolas:nicolas@localhost:5432/crm_marketing?sslmode=disable'
  });
  connections.push({
    name: 'Localhost crm',
    url: 'postgresql://nicolas:nicolas@localhost:5432/crm?sslmode=disable'
  });
  
  connections.push({
    name: 'Production Fallback (aliminspa)',
    url: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable'
  });

  // Load SQL
  let sqlContent = '';
  try {
    const sqlPath = path.join(process.cwd(), 'scripts', 'setup_signature_tables.sql');
    sqlContent = fs.readFileSync(sqlPath, 'utf8');
  } catch (err) {
    console.error('Error reading setup_signature_tables.sql:', err);
    process.exit(1);
  }

  for (const conn of connections) {
    console.log(`Trying to connect to ${conn.name}...`);
    const client = new Client({
      connectionString: conn.url,
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      console.log(`Connected successfully to ${conn.name}! Running Email Signatures schema migration...`);

      // Run migration SQL queries
      await client.query(sqlContent);

      console.log("SUCCESS: 'email_signatures' and 'signature_clicks' tables and indexes are updated and ready.");

      await client.end();
      return; // Stop after success
    } catch (err) {
      console.error(`Error on ${conn.name}:`, (err as Error).message);
    }
  }

  console.error('Migration failed: Could not connect to any database.');
  process.exit(1);
}

migrate();
