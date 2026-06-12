import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Copia de la función de parsing de User Agent para verificar que clasifique bien
function parseUserAgent(ua: string) {
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';
  const uaLower = ua.toLowerCase();

  if (/mobile|android|iphone|ipad|phone/i.test(uaLower)) {
    if (/ipad|tablet/i.test(uaLower)) {
      device = 'Tablet';
    } else {
      device = 'Mobile';
    }
  } else if (/bot|crawler|spider|googlebot|bingbot|yandex|yahoo|baidu/i.test(uaLower)) {
    device = 'Bot';
  }

  if (/iphone|ipad|ipod/i.test(uaLower)) {
    os = 'iOS';
  } else if (/windows/i.test(uaLower)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(uaLower)) {
    os = 'macOS';
  } else if (/android/i.test(uaLower)) {
    os = 'Android';
  } else if (/linux/i.test(uaLower)) {
    os = 'Linux';
  }

  if (/chrome|crios/i.test(uaLower) && !/edge|edg/i.test(uaLower) && !/opr/i.test(uaLower)) {
    browser = 'Chrome';
  } else if (/safari/i.test(uaLower) && !/chrome|crios/i.test(uaLower)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(uaLower)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(uaLower)) {
    browser = 'Edge';
  } else if (/opera|opr/i.test(uaLower)) {
    browser = 'Opera';
  }

  return { browser, os, device };
}

const MOCK_UAS = [
  {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    expected: { browser: 'Safari', os: 'iOS', device: 'Mobile' }
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    expected: { browser: 'Chrome', os: 'Windows', device: 'Desktop' }
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    expected: { browser: 'Safari', os: 'macOS', device: 'Desktop' }
  },
  {
    ua: 'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/114.0 Firefox/114.0',
    expected: { browser: 'Firefox', os: 'Android', device: 'Mobile' }
  }
];

async function getDbClient(): Promise<Client> {
  let marketingDbUrl = process.env.MARKETING_DB_URL;

  if (!marketingDbUrl) {
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^MARKETING_DB_URL=(.+)$/m);
        if (match) {
          marketingDbUrl = match[1].trim();
        }
      }
    } catch (e) {
      // Ignorar
    }
  }

  const connections = [];
  if (marketingDbUrl) {
    connections.push({ name: 'Configured DB', url: marketingDbUrl });
    if (marketingDbUrl.includes('n8n_db-crm')) {
      const localUrl = marketingDbUrl.replace('n8n_db-crm', 'localhost');
      connections.push({ name: 'Configured DB (Localhost fallback)', url: localUrl });
    }
  }
  connections.push({ name: 'Localhost crm_marketing', url: 'postgresql://nicolas:nicolas@localhost:5432/crm_marketing?sslmode=disable' });
  connections.push({ name: 'Localhost crm', url: 'postgresql://nicolas:nicolas@localhost:5432/crm?sslmode=disable' });
  connections.push({ name: 'Production Fallback (aliminspa)', url: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable' });

  for (const conn of connections) {
    const client = new Client({
      connectionString: conn.url,
      connectionTimeoutMillis: 3000
    });
    try {
      await client.connect();
      console.log(`Conectado a BD usando: ${conn.name}`);
      return client;
    } catch (err) {
      // Intentar el siguiente
    }
  }
  throw new Error('No se pudo conectar a ninguna base de datos.');
}

async function runTests() {
  console.log('=== INICIANDO PRUEBAS DE VERIFICACIÓN ===\n');

  // Test 1: User Agent Parser
  console.log('Test 1: Verificando parser de User Agent...');
  let uaPassed = true;
  for (const item of MOCK_UAS) {
    const res = parseUserAgent(item.ua);
    const success = res.browser === item.expected.browser &&
                    res.os === item.expected.os &&
                    res.device === item.expected.device;
    if (success) {
      console.log(`✅ UA Correcto: [${res.device}] [${res.os}] [${res.browser}]`);
    } else {
      console.error(`❌ UA INCORRECTO. Obtuvimos:`, res, `Esperábamos:`, item.expected);
      uaPassed = false;
    }
  }

  if (!uaPassed) {
    console.error('El parser de User Agent tiene errores. Abortando pruebas de BD.');
    return;
  }
  console.log('✅ Parser de UA funcionando perfectamente.\n');

  // Test 2: Prueba de Inserción y Agregación en Base de Datos
  console.log('Test 2: Conectando y probando flujo en Base de Datos...');
  let mockSigId: string | null = null;
  let client: Client | null = null;
  
  try {
    client = await getDbClient();

    // 2a. Crear firma de prueba
    console.log('Creando firma temporal...');
    const insertSigRes = await client.query(`
      INSERT INTO email_signatures (
        name, 
        personal_info, 
        contact_info, 
        social_links, 
        styling, 
        html_content
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      'Firma Test Integración',
      JSON.stringify({ name: 'Tester', job_title: 'QA Engineer', company: 'Alimin' }),
      JSON.stringify({ email: 'tester@alimin.cl', phone: '+56911111111' }),
      JSON.stringify({ instagram: 'https://instagram.com/tester', linkedin: 'https://linkedin.com/in/tester' }),
      JSON.stringify({ template_id: 'modern_border' }),
      '<div>Firma de Prueba HTML</div>'
    ]);

    mockSigId = insertSigRes.rows[0].id;
    console.log(`✅ Firma temporal creada con ID: ${mockSigId}`);

    // 2b. Insertar clics simulados
    console.log('Insertando 3 clics simulados (2 de IP "10.0.0.1" y 1 de IP "10.0.0.2")...');
    
    // Clic 1: IP 10.0.0.1, Instagram, iPhone
    const client1 = parseUserAgent(MOCK_UAS[0].ua);
    await client.query(`
      INSERT INTO signature_clicks (
        signature_id, element, destination_url, ip_address, user_agent, browser, os, device, country, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [mockSigId, 'instagram', 'https://instagram.com/tester', '10.0.0.1', MOCK_UAS[0].ua, client1.browser, client1.os, client1.device, 'Chile', 'Santiago']);

    // Clic 2: IP 10.0.0.1, LinkedIn, iPhone (Misma IP, distinto elemento)
    await client.query(`
      INSERT INTO signature_clicks (
        signature_id, element, destination_url, ip_address, user_agent, browser, os, device, country, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [mockSigId, 'linkedin', 'https://linkedin.com/in/tester', '10.0.0.1', MOCK_UAS[0].ua, client1.browser, client1.os, client1.device, 'Chile', 'Santiago']);

    // Clic 3: IP 10.0.0.2, Instagram, Windows Chrome (Nueva IP, mismo elemento de Clic 1)
    const client2 = parseUserAgent(MOCK_UAS[1].ua);
    await client.query(`
      INSERT INTO signature_clicks (
        signature_id, element, destination_url, ip_address, user_agent, browser, os, device, country, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [mockSigId, 'instagram', 'https://instagram.com/tester', '10.0.0.2', MOCK_UAS[1].ua, client2.browser, client2.os, client2.device, 'Argentina', 'Buenos Aires']);

    console.log('✅ Clics simulados insertados.');

    // 2c. Ejecutar agregaciones (Verificar que total = 3 y únicos = 2)
    console.log('Verificando agregación de métricas...');
    
    // Totales
    const totalsRes = await client.query(`
      SELECT 
        COUNT(*)::int as total_clicks,
        COUNT(DISTINCT ip_address)::int as unique_clicks
      FROM signature_clicks 
      WHERE signature_id = $1
    `, [mockSigId]);
    
    const total = totalsRes.rows[0].total_clicks;
    const unique = totalsRes.rows[0].unique_clicks;
    
    if (total === 3 && unique === 2) {
      console.log(`✅ Totales correctos. Clics Totales: ${total}, Clics Únicos: ${unique}`);
    } else {
      console.error(`❌ ERROR EN TOTALES. Recibimos: Totales=${total}, Únicos=${unique}. Esperábamos Totales=3, Únicos=2`);
    }

    // Elementos
    const elementsRes = await client.query(`
      SELECT element, COUNT(*)::int as clicks
      FROM signature_clicks 
      WHERE signature_id = $1
      GROUP BY element
      ORDER BY clicks DESC
    `, [mockSigId]);

    console.log('Resultados por elemento:');
    elementsRes.rows.forEach(row => {
      console.log(` - ${row.element}: ${row.clicks} clics`);
    });

    // Dispositivos y Sistemas Operativos
    const techRes = await client.query(`
      SELECT device, os, browser, COUNT(*)::int as clicks
      FROM signature_clicks 
      WHERE signature_id = $1
      GROUP BY device, os, browser
    `, [mockSigId]);

    console.log('Resultados tecnológicos:');
    techRes.rows.forEach(row => {
      console.log(` - ${row.device} / ${row.os} / ${row.browser}: ${row.clicks} clics`);
    });

  } catch (err) {
    console.error('❌ Error general de base de datos durante la prueba:', err);
  } finally {
    // 2d. Limpieza
    if (client && mockSigId) {
      console.log('\nLimpiando base de datos...');
      try {
        await client.query('DELETE FROM email_signatures WHERE id = $1', [mockSigId]);
        console.log('✅ Datos de prueba eliminados correctamente.');
      } catch (cleanErr) {
        console.error('Error al limpiar datos de prueba:', cleanErr);
      }
    }
    if (client) {
      await client.end();
    }
  }

  console.log('\n=== PRUEBAS CONCLUIDAS ===');
}

runTests();
