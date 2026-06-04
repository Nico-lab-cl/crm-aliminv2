const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Self-contained UUID v4 generator to avoid dependency issues
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// File paths
const csvFile = path.join(__dirname, '..', 'Clientes_potenciales_en_Instagram.csv');
const kommoFile = path.join(__dirname, '..', 'kommo_export_leads_2025-06-20.xlsx');
const oldDbFile = path.join(__dirname, '..', 'LEADS BASE DE DATOS ANTIGUA.xlsx');
const clientifyFile = path.join(__dirname, '..', 'LEADS clientify.xlsx');

// Advisor mappings
const ADVISOR_MAP = {
  'Orlando Costa': '11111111-1111-1111-1111-111111111111',
  'Barbara Arias': '22222222-2222-2222-2222-222222222222',
  'Marcela Escobar': '33333333-3333-3333-3333-333333333333',
  'Alimin': '44444444-4444-4444-4444-444444444444',
  'Cami Poblete Yout': '55555555-5555-5555-5555-555555555555',
  'Cindy Gutierrez': '66666666-6666-6666-6666-666666666666',
  'S X G': '77777777-7777-7777-7777-777777777777'
};

// Helper normalization functions
function cleanPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return '';
  
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return '+56' + cleaned;
  }
  if (cleaned.length === 11 && cleaned.startsWith('569')) {
    return '+' + cleaned;
  }
  if (cleaned.length === 8 && (cleaned.startsWith('8') || cleaned.startsWith('2') || cleaned.startsWith('3'))) {
    return '+56' + cleaned;
  }
  if (cleaned.startsWith('56')) {
    return '+' + cleaned;
  }
  if (cleaned.length === 9) {
    return '+56' + cleaned;
  }
  return '+' + cleaned;
}

function cleanEmail(email) {
  if (!email) return '';
  let clean = String(email).trim().toLowerCase();
  if (clean.endsWith('.coml')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

function splitName(fullName) {
  if (!fullName) return { first: 'Sin Nombre', last: '' };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return {
    first: parts[0],
    last: parts.slice(1).join(' ')
  };
}

function parseExcelDate(serial) {
  if (!serial) return new Date();
  const num = Number(serial);
  if (isNaN(num)) return new Date();
  return new Date(Math.round((num - 25569) * 86400 * 1000));
}

function parseKommoDate(dateStr) {
  if (!dateStr) return new Date();
  try {
    const parts = String(dateStr).trim().split(' ');
    const dateParts = parts[0].split('.');
    const year = parseInt(dateParts[2]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[0]);
    
    if (parts[1]) {
      const timeParts = parts[1].split(':');
      return new Date(year, month, day, parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2] || '0'));
    }
    return new Date(year, month, day);
  } catch (e) {
    return new Date();
  }
}

// CSV Loader
function loadCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  
  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
  };

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

// XLSX Loader
function loadXlsx(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function main() {
  console.log('=== CONSOLIDATING LEADS IN MEMORY ===');

  const leadsByEmail = {};
  const leadsByPhone = {};
  const consolidatedLeads = [];

  function addLeadToConsolidated(lead) {
    let existing = null;
    if (lead.email && leadsByEmail[lead.email]) {
      existing = leadsByEmail[lead.email];
    }
    if (!existing && lead.phone && leadsByPhone[lead.phone]) {
      existing = leadsByPhone[lead.phone];
    }

    if (existing) {
      if (lead.createdAt < existing.createdAt) {
        existing.createdAt = lead.createdAt;
      }
      if (!existing.firstName || existing.firstName === 'Sin Nombre') {
        existing.firstName = lead.firstName;
      }
      if (!existing.lastName && lead.lastName) {
        existing.lastName = lead.lastName;
      }
      if (!existing.city && lead.city) {
        existing.city = lead.city;
      }
      if (!existing.phone && lead.phone) {
        existing.phone = lead.phone;
      }
      if (!existing.email && lead.email) {
        existing.email = lead.email;
      }
      
      existing.pie = existing.pie || lead.pie;
      existing.monthlyPayment = existing.monthlyPayment || lead.monthlyPayment;
      existing.creditInterest = existing.creditInterest || lead.creditInterest;
      existing.preferredChannel = existing.preferredChannel || lead.preferredChannel;
      existing.inboxUrl = existing.inboxUrl || lead.inboxUrl;
      existing.assignedToId = existing.assignedToId || lead.assignedToId;

      const tags1 = existing.tags ? existing.tags.split(',').map(t => t.trim()) : [];
      const tags2 = lead.tags ? lead.tags.split(',').map(t => t.trim()) : [];
      const mergedTags = Array.from(new Set([...tags1, ...tags2])).filter(Boolean);
      existing.tags = mergedTags.join(', ');

      if (lead.notes) {
        if (existing.notes) {
          existing.notes += '\n' + lead.notes;
        } else {
          existing.notes = lead.notes;
        }
      }
      
      if (lead.email && !leadsByEmail[lead.email]) {
        leadsByEmail[lead.email] = existing;
      }
      if (lead.phone && !leadsByPhone[lead.phone]) {
        leadsByPhone[lead.phone] = existing;
      }
    } else {
      lead.id = generateUUID();
      consolidatedLeads.push(lead);
      if (lead.email) {
        leadsByEmail[lead.email] = lead;
      }
      if (lead.phone) {
        leadsByPhone[lead.phone] = lead;
      }
    }
  }

  // 1. Process Instagram CSV
  console.log('Processing Instagram CSV...');
  const csvRows = loadCsv(csvFile);
  csvRows.forEach(r => {
    const email = cleanEmail(r['Email']);
    const phone = cleanPhone(r['Número de WhatsApp (+56)'] || r['Phone number']);
    const nameParts = splitName(r['Full name']);
    const createdAt = r['Created Time'] ? new Date(r['Created Time']) : new Date();
    
    let assignedToId = null;
    const formName = r['Form Name'] ? String(r['Form Name']).toUpperCase() : '';
    if (formName.includes('MARCELA')) {
      assignedToId = ADVISOR_MAP['Marcela Escobar'];
    } else if (formName.includes('BARBARA') || formName.includes('BÁRBARA')) {
      assignedToId = ADVISOR_MAP['Barbara Arias'];
    } else if (formName.includes('ORLANDO')) {
      assignedToId = ADVISOR_MAP['Orlando Costa'];
    }

    const pie = r['¿Cuentas con un pie inicial desde los 15 Millones de pesos?'] || r['¿Cuentas con un pie inicial de 15 Millones de pesos?'] || '';
    const monthlyPayment = r['¿Puedes pagar cuotas mensuales de 400 mil pesos?'] || '';
    const creditInterest = r['¿Te interesaría trabajar un crédito directo (Sin intereses) ?'] || '';
    const preferredChannel = r['¿Por dónde quieres recibir la información?'] || '';
    const inboxUrl = r['Inbox URL'] || '';

    const lead = {
      firstName: nameParts.first,
      lastName: nameParts.last,
      phone,
      email,
      city: r['City'] || '',
      source: 'instagram',
      status: 'Nuevo',
      tags: 'instagram-csv',
      notes: r['State'] && r['State'] !== 'soltero' && r['State'] !== 'soltera' && r['State'] !== 'I' && r['State'] !== 'S' ? `Estado: ${r['State']}` : '',
      pie,
      monthlyPayment,
      creditInterest,
      preferredChannel,
      inboxUrl,
      assignedToId,
      createdAt,
      updatedAt: new Date()
    };

    addLeadToConsolidated(lead);
  });

  // 2. Process Kommo Export
  console.log('Processing Kommo Export...');
  const kommoRows = loadXlsx(kommoFile);
  kommoRows.forEach(r => {
    const email = cleanEmail(r['Correo (contacto)'] || r['E-mail priv. (contacto)']);
    const phone = cleanPhone(r['Teléfono oficina (contacto)'] || r['Teléfono celular (contacto)']);
    
    let nameParts = { first: 'Sin Nombre', last: '' };
    if (r['Contacto principal']) {
      nameParts = splitName(r['Contacto principal']);
    } else if (r['Nombre del lead'] && !String(r['Nombre del lead']).startsWith('Lead #')) {
      nameParts = splitName(r['Nombre del lead']);
    }

    const createdAt = r['Fecha de Creación'] ? parseKommoDate(r['Fecha de Creación']) : new Date();

    let assignedToId = null;
    const resp = r['Responsable'] ? String(r['Responsable']).trim() : '';
    if (ADVISOR_MAP[resp]) {
      assignedToId = ADVISOR_MAP[resp];
    }

    const pie = r['Pie inicial (contacto)'] || r['Cuenta con pie inicial (contacto)'] || '';
    const monthlyPayment = r['Monto de cuotas (contacto)'] || r['Capacidad de pago (contacto)'] || '';
    const creditInterest = r['Interés en crédito (contacto)'] || '';
    const inboxUrl = r['Inbox url (contacto)'] || '';

    const notesArr = [];
    ['Nota 1', 'Nota 2', 'Nota 3', 'Nota 4', 'Nota 5'].forEach(k => {
      if (r[k]) notesArr.push(r[k]);
    });
    if (r['¿Estás buscando invertir en terrenos en la playa? (contacto)']) {
      notesArr.push(`Invertir playa: ${r['¿Estás buscando invertir en terrenos en la playa? (contacto)']}`);
    }
    if (r['¿En qué plazo te gustaría concretar la compra? (contacto)']) {
      notesArr.push(`Plazo compra: ${r['¿En qué plazo te gustaría concretar la compra? (contacto)']}`);
    }
    if (r['¿Cuál es tu presupuesto estimado para inversión? (contacto)']) {
      notesArr.push(`Presupuesto inversion: ${r['¿Cuál es tu presupuesto estimado para inversión? (contacto)']}`);
    }
    if (r['¿Quieres recibir una oferta exclusiva por WhatsApp? (contacto)']) {
      notesArr.push(`WhatsApp oferta: ${r['¿Quieres recibir una oferta exclusiva por WhatsApp? (contacto)']}`);
    }

    const lead = {
      firstName: nameParts.first,
      lastName: nameParts.last,
      phone,
      email,
      city: r['Comuna (contacto)'] || r['REGION TIME - Область или город (contacto)'] || '',
      source: r['Source'] || 'kommo',
      status: 'Nuevo',
      tags: r['Etiquetas del lead'] || 'kommo-export',
      notes: notesArr.join(' | '),
      pie,
      monthlyPayment,
      creditInterest,
      preferredChannel: r['Prefiere contacto por (contacto)'] || '',
      inboxUrl,
      assignedToId,
      createdAt,
      updatedAt: new Date()
    };

    addLeadToConsolidated(lead);
  });

  // 3. Process Old DB
  console.log('Processing Old DB...');
  const oldDbRows = loadXlsx(oldDbFile);
  oldDbRows.forEach(r => {
    const email = cleanEmail(r['EMAIL']);
    const phone = cleanPhone(r['SMS']);
    const createdAt = r['ADDED_TIME'] ? parseExcelDate(r['ADDED_TIME']) : new Date();

    const lead = {
      firstName: r['NOMBRE'] || 'Sin Nombre',
      lastName: r['APELLIDOS'] || '',
      phone,
      email,
      city: '',
      source: 'old-db',
      status: 'Nuevo',
      tags: 'old-db',
      notes: '',
      pie: '',
      monthlyPayment: '',
      creditInterest: '',
      preferredChannel: '',
      inboxUrl: '',
      assignedToId: null,
      createdAt,
      updatedAt: new Date()
    };

    addLeadToConsolidated(lead);
  });

  // 4. Process Clientify
  console.log('Processing Clientify...');
  const clientifyRows = loadXlsx(clientifyFile);
  clientifyRows.forEach(r => {
    const email = cleanEmail(r['email 1'] || r['email 2'] || r['email 3']);
    const phone = cleanPhone(r['teléfono 1'] || r['teléfono 2'] || r['teléfono 3']);
    
    const lead = {
      firstName: r['nombre '] ? String(r['nombre ']).trim() : 'Sin Nombre',
      lastName: r['apellidos'] || '',
      phone,
      email,
      city: r['calle 1'] || '',
      source: r['origen'] || 'clientify',
      status: 'Nuevo',
      tags: 'clientify',
      notes: [r['calle 2'], r['calle 3']].filter(Boolean).join(', '),
      pie: '',
      monthlyPayment: '',
      creditInterest: '',
      preferredChannel: '',
      inboxUrl: '',
      assignedToId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    addLeadToConsolidated(lead);
  });

  console.log('\n--- Consolidation Summary ---');
  console.log(`Total Consolidated Leads: ${consolidatedLeads.length}`);
  
  const endpoint = 'https://marketing.aliminlomasdelmar.com/api/webhooks/migrate-and-import';
  const token = 'chris.2026';

  console.log('\nStep 1: Running migrations and advisor setup on production database...');
  try {
    const migrateRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'migrate' })
    });
    const migrateJson = await migrateRes.json();
    if (!migrateRes.ok) {
      throw new Error(`Migration API error: ${JSON.stringify(migrateJson)}`);
    }
    console.log('Migration response:', migrateJson.message || migrateJson);
  } catch (err) {
    console.error('Fatal: Migration failed:', err.message);
    return;
  }

  console.log('\nStep 2: Uploading leads to production database in chunks...');
  const fields = [
    'id', 'contactId', 'firstName', 'lastName', 'phone', 'email', 
    'businessName', 'city', 'source', 'status', 'tags', 'lastActivity', 
    'assignedToId', 'notes', 'visited', 'visitDate', 'visitProject', 
    'lote', 'etapa', 'interests', 'rating', 'lastNoteAt', 'signingStatus', 
    'signingDate', 'signingProject', 'signingLote', 'signingEtapa', 
    'visitReminderSent1d', 'visitReminderSent1h', 'utmSource', 
    'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'adId', 
    'adName', 'formId', 'createdAt', 'updatedAt', 
    'pie', 'monthlyPayment', 'creditInterest', 'preferredChannel', 'inboxUrl'
  ];

  const chunkSize = 400; // Chunk size for API upload
  let count = 0;

  for (let i = 0; i < consolidatedLeads.length; i += chunkSize) {
    const chunk = consolidatedLeads.slice(i, i + chunkSize);
    
    try {
      const uploadRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'import',
          leads: chunk,
          fields
        })
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(`Upload API error: ${JSON.stringify(uploadJson)}`);
      }
      count += chunk.length;
      console.log(`Uploaded chunk ${Math.floor(i / chunkSize) + 1} (${count}/${consolidatedLeads.length} records)`);
    } catch (err) {
      console.error(`Error uploading chunk starting at index ${i}:`, err.message);
      // Wait 1s and retry once
      console.log('Retrying in 2 seconds...');
      await new Promise(r => setTimeout(r, 2000));
      try {
        const uploadRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'import',
            leads: chunk,
            fields
          })
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(`Retry Upload API error: ${JSON.stringify(uploadJson)}`);
        }
        count += chunk.length;
        console.log(`Retry SUCCESS. Uploaded chunk ${Math.floor(i / chunkSize) + 1} (${count}/${consolidatedLeads.length} records)`);
      } catch (retryErr) {
        console.error('Fatal: Retry failed. Aborting import.');
        return;
      }
    }
  }

  console.log('\nStep 3: Cleaning tags in production database...');
  try {
    const cleanRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'clean_tags' })
    });
    const cleanJson = await cleanRes.json();
    if (!cleanRes.ok) {
      throw new Error(`Clean tags API error: ${JSON.stringify(cleanJson)}`);
    }
    console.log('Clean tags response:', cleanJson.message || cleanJson);
  } catch (err) {
    console.error('Error cleaning tags:', err.message);
  }

  console.log(`\nALL DONE! Uploaded and merged ${count} leads in the production CRM database!`);
}

main().catch(err => console.error(err));
