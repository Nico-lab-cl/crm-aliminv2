const { Client } = require('pg');

async function main() {
  const connectionString = process.env.MAIN_DB_URL || 'postgresql://nicolas:nicolas@localhost:5432/crm?sslmode=disable';
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to AliminSpa DB');

    console.log('Cleaning tags in database using optimized SQL query...');
    const query = `
      UPDATE "Lead"
      SET tags = (
        SELECT string_agg(DISTINCT trim(tag), ', ')
        FROM unnest(string_to_array(tags, ',')) AS tag
      )
      WHERE tags IS NOT NULL AND tags LIKE '%,%';
    `;
    const start = Date.now();
    const result = await client.query(query);
    console.log(`Cleaned tags! Query affected ${result.rowCount} rows in ${Date.now() - start}ms.`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
