/**
 * Script para asignar leads masivamente desde un CSV a un asesor.
 * Asigna por EMAIL y por TELÉFONO para cubrir el 100% de los contactos.
 * 
 * USO:
 *   node scripts/assign-leads.js <CSV_PATH> <USER_ID>
 */

const fs = require('fs');
const path = require('path');

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function main() {
  const csvPath = process.argv[2];
  const userId = process.argv[3];

  if (!csvPath || !userId) {
    console.log('USO: node scripts/assign-leads.js <CSV_PATH> <USER_ID>');
    process.exit(1);
  }

  const fullPath = path.resolve(csvPath);
  console.log(`📂 Leyendo CSV: ${fullPath}`);

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1); // Skip header
  console.log(`📊 Total de registros en CSV: ${dataLines.length}`);

  const emails = [];
  const phonesOnly = []; // Phones for contacts WITHOUT email

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    // CSV columns: ContactId, FirstName, LastName, Phone, Email, BusinessName, Created, LastActivity, Tags
    const phone = (fields[3] || '').replace(/"/g, '').trim();
    const email = (fields[4] || '').replace(/"/g, '').trim().toLowerCase();

    if (email && email.includes('@')) {
      emails.push(email);
    } else if (phone) {
      phonesOnly.push(phone);
    }
  }

  console.log(`📧 Con email válido: ${emails.length}`);
  console.log(`📱 Solo con teléfono (sin email): ${phonesOnly.length}`);
  console.log(`📋 Total a asignar: ${emails.length + phonesOnly.length}`);

  // Generate SQL
  const sqlOutput = path.join(path.dirname(fullPath), `assign_${path.basename(csvPath, '.csv')}.sql`);
  
  let sql = `-- Script de asignación masiva COMPLETO (email + teléfono)\n`;
  sql += `-- Generado: ${new Date().toISOString()}\n`;
  sql += `-- CSV: ${path.basename(csvPath)}\n`;
  sql += `-- Target User ID: ${userId}\n`;
  sql += `-- Emails: ${emails.length} | Solo Teléfono: ${phonesOnly.length} | Total: ${emails.length + phonesOnly.length}\n\n`;

  // Part 1: Assign by email
  sql += `-- ========================================\n`;
  sql += `-- PARTE 1: Asignación por EMAIL (${emails.length} leads)\n`;
  sql += `-- ========================================\n\n`;

  const batchSize = 200;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const emailList = batch.map(e => `'${e.replace(/'/g, "''")}'`).join(',\n  ');
    sql += `UPDATE "Lead" SET "assignedToId" = '${userId}'\nWHERE LOWER("email") IN (\n  ${emailList}\n) AND "source" NOT ILIKE '%META%' AND "source" NOT ILIKE '%WEB%';\n\n`;
  }

  // Part 2: Assign by phone (for those without email)
  if (phonesOnly.length > 0) {
    sql += `-- ========================================\n`;
    sql += `-- PARTE 2: Asignación por TELÉFONO (${phonesOnly.length} leads sin email)\n`;
    sql += `-- ========================================\n\n`;

    for (let i = 0; i < phonesOnly.length; i += batchSize) {
      const batch = phonesOnly.slice(i, i + batchSize);
      const phoneList = batch.map(p => `'${p.replace(/'/g, "''")}'`).join(',\n  ');
      sql += `UPDATE "Lead" SET "assignedToId" = '${userId}'\nWHERE "phone" IN (\n  ${phoneList}\n) AND "source" NOT ILIKE '%META%' AND "source" NOT ILIKE '%WEB%';\n\n`;
    }
  }

  sql += `-- ========================================\n`;
  sql += `-- VERIFICACIÓN\n`;
  sql += `-- ========================================\n`;
  sql += `SELECT COUNT(*) as "total_asignados_a_barbara" FROM "Lead" WHERE "assignedToId" = '${userId}';\n`;

  fs.writeFileSync(sqlOutput, sql);
  console.log(`\n✅ Script SQL generado: ${sqlOutput}`);
  console.log(`   Copia y pega en Easypanel para asignar los leads.`);
}

main().catch(console.error);
