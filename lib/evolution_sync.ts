import { Pool, PoolClient } from 'pg';
import { queryMarketing, queryMain } from './db';

// URL de la base de datos de Evolution API (N8N)
const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';

// Creamos un pool de conexión aislado para la base de datos de Evolution API
let evolutionPool: Pool | null = null;

function getEvolutionPool(): Pool {
  if (!evolutionPool) {
    evolutionPool = new Pool({
      connectionString: evolutionDbUrl,
      connectionTimeoutMillis: 5000,
    });
  }
  return evolutionPool;
}

/**
 * Inicializa la tabla whatsapp_messages en el CRM si no existe.
 */
export async function initWhatsappTable() {
  try {
    await queryMarketing(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255) UNIQUE NOT NULL,
          lead_id UUID, -- Referencia al contacto en la base de datos principal
          remote_jid VARCHAR(255) NOT NULL,
          from_me BOOLEAN NOT NULL,
          body TEXT,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          instance_id VARCHAR(255),
          advisor_name VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryMarketing(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id ON whatsapp_messages(lead_id)`);
    await queryMarketing(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(timestamp)`);
    console.log('✓ Tabla whatsapp_messages verificada/creada correctamente en la base de datos de Marketing.');
  } catch (error) {
    console.error('Error al inicializar tabla whatsapp_messages:', error);
  }
}

/**
 * Estructura para describir la introspección de columnas de la base de datos de Evolution.
 */
interface EvolutionSchemaMeta {
  tableName: string; // 'Message' o 'message'
  idCol: string;
  jidCol: string;
  fromMeCol: string;
  contentCol: string;
  timestampCol: string;
  instanceCol: string;
}

/**
 * Descubre el esquema de la tabla de mensajes en la base de datos de Evolution API.
 * Esto hace al motor auto-adaptable a diferentes versiones de Evolution API.
 */
async function introspectEvolutionSchema(pool: Pool): Promise<EvolutionSchemaMeta> {
  const client = await pool.connect();
  try {
    // 1. Encontrar la tabla (Message o message)
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name = 'Message' OR table_name = 'message')
    `);
    
    if (tablesRes.rows.length === 0) {
      throw new Error('No se encontró la tabla de mensajes (Message/message) en la base de datos de Evolution.');
    }
    
    const tableName = tablesRes.rows[0].table_name;

    // 2. Obtener todas las columnas
    const colsRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    const cols = colsRes.rows.map(r => r.column_name);

    // 3. Mapear columnas según presencia
    const idCol = cols.find(c => ['id', 'keyId', 'keyid', 'messageId', 'messageid'].includes(c)) || 'id';
    const jidCol = cols.find(c => ['remoteJid', 'remote_jid', 'jid', 'remotejid'].includes(c)) || 'remoteJid';
    const fromMeCol = cols.find(c => ['fromMe', 'from_me', 'fromme'].includes(c)) || 'fromMe';
    const contentCol = cols.find(c => ['message', 'content', 'body', 'text'].includes(c)) || 'message';
    const timestampCol = cols.find(c => ['messageTimestamp', 'timestamp', 'createdAt', 'created_at', 'messagetimestamp'].includes(c)) || 'messageTimestamp';
    const instanceCol = cols.find(c => ['instanceId', 'instance_id', 'instanceid'].includes(c)) || 'instanceId';

    return {
      tableName,
      idCol,
      jidCol,
      fromMeCol,
      contentCol,
      timestampCol,
      instanceCol
    };
  } finally {
    client.release();
  }
}

/**
 * Parsea el JSON del mensaje de Baileys para extraer el contenido en texto plano de forma robusta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMessageBody(messageObj: any): string {
  if (!messageObj) return '';
  
  let parsed = messageObj;
  if (typeof messageObj === 'string') {
    try {
      parsed = JSON.parse(messageObj);
    } catch {
      return messageObj;
    }
  }

  // Baileys usualmente anida dentro del campo "message"
  const msg = parsed.message || parsed;

  if (!msg) return '';

  if (typeof msg === 'string') return msg;

  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.title) return msg.documentMessage.title;
  
  if (msg.buttonsResponseMessage?.selectedButtonId) {
    return `[Botón presionado: ${msg.buttonsResponseMessage.selectedButtonText || msg.buttonsResponseMessage.selectedButtonId}]`;
  }
  if (msg.templateButtonReplyMessage?.selectedId) {
    return `[Botón presionado: ${msg.templateButtonReplyMessage.selectedId}]`;
  }
  if (msg.listResponseMessage?.title) {
    return `[Lista seleccionada: ${msg.listResponseMessage.title}]`;
  }

  // Fallbacks para otros tipos de mensajes
  if (msg.imageMessage) return '[Imagen 📷]';
  if (msg.audioMessage) return '[Audio 🎙️]';
  if (msg.videoMessage) return '[Video 🎥]';
  if (msg.documentMessage) return '[Documento 📄]';
  if (msg.locationMessage) return '[Ubicación 📍]';
  if (msg.contactMessage || msg.vcard) return '[Contacto 👤]';
  if (msg.contactsArrayMessage) return '[Contactos 👥]';
  if (msg.stickerMessage) return '[Sticker 🖼️]';
  if (msg.protocolMessage) return '[Mensaje de Protocolo/Sistema]';
  if (msg.reactionMessage) return `[Reacción: ${msg.reactionMessage.text || '💬'}]`;

  return '';
}

/**
 * Resuelve una fecha a partir de lo que devuelva la DB (puede ser Unix timestamp o un objeto Date).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvolutionTimestamp(rawVal: any): Date {
  if (!rawVal) return new Date();
  if (rawVal instanceof Date) return rawVal;
  
  const num = Number(rawVal);
  if (!isNaN(num)) {
    // Si es un timestamp en segundos (WhatsApp lo guarda en segundos a menudo)
    if (num < 10000000000) {
      return new Date(num * 1000);
    }
    return new Date(num);
  }
  
  const parsed = new Date(rawVal);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Obtiene el mapa de instancias creadas en Evolution API para relacionar ID con Nombre de Asesor.
 */
async function getAdvisorInstancesMap(pool: Pool): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const client = await pool.connect();
  try {
    // Introspectar si existe la tabla Instance
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name = 'Instance' OR table_name = 'instance')
    `);
    
    if (tableCheck.rows.length > 0) {
      const tableName = tableCheck.rows[0].table_name;
      
      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
      `, [tableName]);
      const cols = colsRes.rows.map(r => r.column_name);

      const idCol = cols.find(c => ['id', 'instanceId', 'instanceid'].includes(c)) || 'id';
      const nameCol = cols.find(c => ['name', 'instanceName', 'instancename'].includes(c)) || 'name';

      const instancesRes = await client.query(`SELECT "${idCol}" as id, "${nameCol}" as name FROM "${tableName}"`);
      
      for (const row of instancesRes.rows) {
        map.set(row.id, row.name);
      }
    }
  } catch (e) {
    console.warn('No se pudo mapear la tabla Instance de Evolution API, se usará el ID de la instancia directamente:', (e as Error).message);
  } finally {
    client.release();
  }
  return map;
}

/**
 * Vincula un nombre de instancia de WhatsApp con el nombre del asesor en el CRM de forma inteligente.
 */
function getAdvisorNameFromInstance(instanceName: string): string {
  if (!instanceName) return 'WhatsApp Sistema';
  
  const lower = instanceName.toLowerCase();
  
  if (lower.includes('marcela')) return 'Marcela Espinoza';
  if (lower.includes('orlando')) return 'Orlando Castillo';
  if (lower.includes('barbara')) return 'Barbara'; // Asesor Bárbara
  if (lower.includes('claudia')) return 'Claudia Riquelme';
  
  // Si no hace match, capitalizar el nombre de la instancia
  return instanceName.charAt(0).toUpperCase() + instanceName.slice(1);
}

/**
 * Realiza la sincronización de mensajes de WhatsApp desde Evolution API hacia el CRM.
 * @param jid Opcional. Si se pasa, solo sincroniza los mensajes de este JID/contacto específico.
 * @param hoursBack Opcional. Rango de tiempo hacia atrás a sincronizar.
 */
export async function syncEvolutionChats(jid?: string, hoursBack?: number) {
  await initWhatsappTable();
  
  const pool = getEvolutionPool();
  const client = await pool.connect();
  
  try {
    // 1. Introspectar esquema
    const schema = await introspectEvolutionSchema(pool);
    console.log('✓ Esquema de Evolution API introspectado:', schema);

    // 2. Obtener mapa de instancias
    const instancesMap = await getAdvisorInstancesMap(pool);
    console.log('✓ Instancias encontradas en Evolution API:', Array.from(instancesMap.entries()));

    // 3. Determinar punto de inicio (sincronización incremental)
    let sinceTimestamp: Date | null = null;
    
    if (hoursBack) {
      sinceTimestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    } else {
      // Buscar la fecha del último mensaje sincronizado en nuestro CRM
      const lastMsgRes = await queryMarketing(`
        SELECT timestamp FROM whatsapp_messages 
        ORDER BY timestamp DESC LIMIT 1
      `);
      if (lastMsgRes.rows.length > 0) {
        sinceTimestamp = new Date(lastMsgRes.rows[0].timestamp);
      }
    }

    // 4. Construir consulta en Evolution DB
    const selectClauses = ['1=1'];
    const queryParams: unknown[] = [];

    if (jid) {
      queryParams.push(jid);
      selectClauses.push(`"${schema.jidCol}" = $${queryParams.length}`);
    }

    if (sinceTimestamp) {
      queryParams.push(sinceTimestamp);
      // Para bases de datos donde timestampCol sea BigInt (Unix seconds), convertimos el Date a segundos
      const isBigIntType = await checkIsBigIntColumn(client, schema.tableName, schema.timestampCol);
      if (isBigIntType) {
        const secs = Math.floor(sinceTimestamp.getTime() / 1000);
        queryParams[queryParams.length - 1] = secs;
        selectClauses.push(`"${schema.timestampCol}" > $${queryParams.length}`);
      } else {
        selectClauses.push(`"${schema.timestampCol}" > $${queryParams.length}`);
      }
    }

    // Limitar para evitar cargas masivas gigantescas por solicitud
    const limit = jid ? 500 : 2000;
    const queryText = `
      SELECT 
        "${schema.idCol}" as id,
        "${schema.jidCol}" as remote_jid,
        "${schema.fromMeCol}" as from_me,
        "${schema.contentCol}" as content,
        "${schema.timestampCol}" as raw_timestamp,
        "${schema.instanceCol}" as instance_id
      FROM "${schema.tableName}"
      WHERE ${selectClauses.join(' AND ')}
      ORDER BY "${schema.timestampCol}" ASC
      LIMIT ${limit}
    `;

    console.log(`Ejecutando consulta en Evolution DB: ${queryText} con parámetros ${queryParams}`);
    const res = await client.query(queryText, queryParams);
    console.log(`Se encontraron ${res.rows.length} mensajes para sincronizar.`);

    if (res.rows.length === 0) {
      return { syncedCount: 0 };
    }

    // 5. Mapear JIDs a Lead IDs del CRM
    // Para hacerlo rápido, primero extraemos todos los JIDs únicos de los mensajes recuperados
    const uniqueJids = Array.from(new Set(res.rows.map(r => r.remote_jid)));
    const jidToLeadIdMap = new Map<string, string>();

    // Buscar en la DB del CRM
    for (const remoteJid of uniqueJids) {
      // Limpiar JID para obtener solo dígitos
      const phoneDigits = remoteJid.split('@')[0].replace(/\D/g, '');
      if (phoneDigits) {
        // Ejecutar búsqueda por teléfono limpia
        // Busca si el teléfono del lead termina con el número de WhatsApp (para ignorar código de país opcional)
        // O si el número de WhatsApp contiene el teléfono limpio.
        const matchRes = await queryMain(`
          SELECT id FROM "Lead" 
          WHERE "Phone" IS NOT NULL AND (
            REGEXP_REPLACE("Phone", '[^0-9]', '', 'g') = $1
            OR $1 LIKE '%' || REGEXP_REPLACE("Phone", '[^0-9]', '', 'g')
          )
          LIMIT 1
        `, [phoneDigits]);

        if (matchRes.rows.length > 0) {
          jidToLeadIdMap.set(remoteJid, matchRes.rows[0].id);
        }
      }
    }

    // 6. Insertar los mensajes en el CRM
    let insertedCount = 0;
    for (const row of res.rows) {
      const messageId = row.id;
      const leadId = jidToLeadIdMap.get(row.remote_jid) || null;
      const fromMe = Boolean(row.from_me);
      const body = extractMessageBody(row.content);
      const timestamp = parseEvolutionTimestamp(row.raw_timestamp);
      const instanceId = row.instance_id;
      
      const instanceName = instancesMap.get(instanceId) || instanceId;
      const advisorName = getAdvisorNameFromInstance(instanceName);

      try {
        await queryMarketing(`
          INSERT INTO whatsapp_messages 
            (message_id, lead_id, remote_jid, from_me, body, timestamp, instance_id, advisor_name)
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (message_id) DO NOTHING
        `, [messageId, leadId, row.remote_jid, fromMe, body, timestamp, instanceId, advisorName]);
        insertedCount++;
      } catch (err) {
        console.error(`Error al insertar mensaje ${messageId}:`, err);
      }
    }

    console.log(`Sincronización completada. Se insertaron ${insertedCount} mensajes en la base de datos local.`);
    return { syncedCount: insertedCount };

  } catch (error) {
    console.error('Error durante la sincronización de Evolution API:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Función auxiliar para verificar si una columna es de tipo bigint (numérica).
 */
async function checkIsBigIntColumn(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  try {
    const res = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    if (res.rows.length > 0) {
      const dataType = res.rows[0].data_type.toLowerCase();
      return dataType.includes('int') || dataType.includes('numeric');
    }
  } catch (e) {
    console.warn('Error al verificar tipo de datos de columna:', e);
  }
  return false;
}
