/**
 * Script de prueba de conexión e introspección a la Base de Datos de Evolution API.
 * Ejecutar con: node scripts/test_evolution_conn.js
 */

const { Client } = require('pg');

// Cargar URL de la base de datos de Evolution API (de .env o fallback)
const dbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';

console.log('========================================================');
console.log('PRUEBA DE CONEXIÓN A BASE DE DATOS DE EVOLUTION API');
console.log('========================================================');
console.log(`Intentando conectar a: ${dbUrl.replace(/:([^:@]+)@/, ':****@')}`);
console.log('(Contraseña enmascarada por seguridad)\n');

const client = new Client({
  connectionString: dbUrl,
  connectionTimeoutMillis: 5000
});

async function run() {
  try {
    await client.connect();
    console.log('✓ ¡Conexión exitosa a la base de datos de Evolution!\n');

    // 1. Listar todas las tablas en el esquema public
    console.log('--- TABLAS DISPONIBLES EN ESQUEMA "public" ---');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(tables.join(', ') || '(Ninguna tabla encontrada)');
    console.log('');

    // 2. Verificar tabla de Mensajes (generalmente Message)
    const msgTable = tables.find(t => t.toLowerCase() === 'message');
    if (msgTable) {
      console.log(`✓ Tabla de mensajes encontrada: "${msgTable}"`);
      
      // Introspectar columnas
      const colsRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `, [msgTable]);
      
      console.log(`Columnas de "${msgTable}":`);
      colsRes.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      console.log('');

      // Traer muestras de datos
      try {
        console.log(`Obteniendo últimos 3 mensajes de "${msgTable}":`);
        const sampleRes = await client.query(`SELECT * FROM "${msgTable}" LIMIT 3`);
        if (sampleRes.rows.length > 0) {
          sampleRes.rows.forEach((row, i) => {
            console.log(`\nMuestra #${i + 1}:`);
            console.log(JSON.stringify(row, null, 2));
          });
        } else {
          console.log('(La tabla de mensajes está vacía)');
        }
      } catch (err) {
        console.error(`Error al consultar muestras de la tabla ${msgTable}:`, err.message);
      }
    } else {
      console.log('✗ No se encontró ninguna tabla similar a "Message" en la base de datos.');
    }
    console.log('');

    // 3. Verificar tabla de Instancias (generalmente Instance)
    const instTable = tables.find(t => t.toLowerCase() === 'instance');
    if (instTable) {
      console.log(`✓ Tabla de instancias encontrada: "${instTable}"`);
      try {
        const instRes = await client.query(`SELECT * FROM "${instTable}"`);
        console.log(`Instancias registradas (${instRes.rows.length}):`);
        instRes.rows.forEach(row => {
          console.log(`  - ID: ${row.id || row.instanceId} | Nombre: ${row.name || row.instanceName}`);
        });
      } catch (err) {
        console.error(`Error al consultar la tabla de instancias:`, err.message);
      }
    } else {
      console.log('⚠ No se encontró ninguna tabla similar a "Instance".');
    }

  } catch (error) {
    console.error('✗ ERROR AL CONECTAR A LA BASE DE DATOS:');
    console.error(error);
    console.log('\n========================================================');
    console.log('CONSEJOS DE DIAGNÓSTICO:');
    console.log('1. Si estás ejecutando este script de prueba desde tu máquina LOCAL:');
    console.log('   El host "n8n_evolution-api-db" solo funciona dentro de la red docker de tu VPS.');
    console.log('   Para conectarte localmente, debes hacer un túnel SSH o usar la IP pública de tu VPS');
    console.log('   y asegurarte de que el puerto 5432 esté expuesto y el firewall lo permita.');
    console.log('2. Si estás ejecutando en el VPS:');
    console.log('   Asegúrate de que este contenedor de Next.js esté en la misma red de docker compose');
    console.log('   que el contenedor de la base de datos de Evolution API (n8n_evolution-api-db).');
    console.log('========================================================');
  } finally {
    await client.end();
  }
}

run();
