const { Client } = require('pg');

async function tryConnect(url) {
    console.log(`Connecting to: ${url}`);
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        return client;
    } catch (e) {
        console.error(`Failed to connect to ${url}: ${e.message}`);
        return null;
    }
}

async function main() {
    const urls = [
        'postgresql://nicolas:nicolas@localhost:15432/crm_marketing?sslmode=disable',
        'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm_marketing?sslmode=disable',
        'postgresql://nicolas:nicolas@localhost:5432/crm_marketing?sslmode=disable',
        'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm?sslmode=disable'
    ];

    let client = null;
    for (const url of urls) {
        client = await tryConnect(url);
        if (client) break;
    }

    if (!client) {
        console.error('Could not connect to any database URL.');
        process.exit(1);
    }

    try {
        console.log('Successfully connected. Checking lead_activities table...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS lead_activities (
                id SERIAL PRIMARY KEY,
                lead_id UUID NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                page_url TEXT,
                page_title VARCHAR(255),
                details JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('lead_activities table check/creation completed successfully.');

    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await client.end();
    }
}

main();
