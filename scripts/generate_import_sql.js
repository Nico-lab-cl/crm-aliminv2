const fs = require('fs');
const path = require('path');

function escapeSql(str) {
    if (!str) return 'NULL';
    return `'${str.replace(/'/g, "''")}'`;
}

const config = [
    { file: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Barbara A_Mar_2026_11_15_AM.csv', advisor: 'Barbara.a@aliminspa.cl' },
    { file: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Marcela E_Mar_2026_11_15_AM.csv', advisor: 'marcela.e@aliminspa.cl' },
    { file: 'c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\Export_Contacts_Orlando_Mar_2026_11_15_AM.csv', advisor: 'Orlando.c@aliminspa.cl' }
];

let sql = '';

// Add schema update just in case
sql += '-- Update schema to include assignedToId\n';
sql += 'ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;\n';
sql += 'DO $$\n';
sql += 'BEGIN\n';
sql += '    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = \'Lead_assignedToId_fkey\') THEN\n';
sql += '        ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;\n';
sql += '    END IF;\n';
sql += 'END $$;\n\n';

for (const entry of config) {
    if (!fs.existsSync(entry.file)) {
        console.warn(`File not found: ${entry.file}`);
        continue;
    }

    const content = fs.readFileSync(entry.file, 'utf8');
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    console.log(`Processing ${entry.file}...`);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parser for quoted values
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });

        const id = escapeSql(require('crypto').randomUUID());
        const contactId = escapeSql(row['Contact Id']);
        const firstName = escapeSql(row['First Name']);
        const lastName = escapeSql(row['Last Name']);
        const phone = escapeSql(row['Phone']);
        const email = escapeSql(row['Email']);
        const businessName = escapeSql(row['Business Name']);
        const tags = escapeSql(row['Tags']);
        const lastActivity = escapeSql(row['Last Activity']);
        const advisorUsername = entry.advisor;

        sql += `INSERT INTO "Lead" ("id", "contactId", "firstName", "lastName", "phone", "email", "businessName", "tags", "lastActivity", "source", "assignedToId", "updatedAt")\n`;
        sql += `VALUES (${id}, ${contactId}, ${firstName}, ${lastName}, ${phone}, ${email}, ${businessName}, ${tags}, ${lastActivity}, 'CSV Import', (SELECT "id" FROM "User" WHERE "username" = '${advisorUsername}'), CURRENT_TIMESTAMP);\n`;
    }
}

fs.writeFileSync('c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\import_leads_data.sql', sql);
console.log('SQL file generated: c:\\Users\\pc\\OneDrive\\Desktop\\CRM-Alimin\\import_leads_data.sql');
