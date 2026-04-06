import { Pool } from 'pg';

// Database 1: Meta and Clients (Lomas del Mar)
const metaPool = new Pool({
  host: process.env.DB_META_HOST,
  port: parseInt(process.env.DB_META_PORT || '5432'),
  database: process.env.DB_META_NAME,
  user: process.env.DB_META_USER,
  password: process.env.DB_META_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

// Database 2: Web Leads
const webPool = new Pool({
  host: process.env.DB_WEB_HOST,
  port: parseInt(process.env.DB_WEB_PORT || '5432'),
  database: process.env.DB_WEB_NAME,
  user: process.env.DB_WEB_USER,
  password: process.env.DB_WEB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

export const queryMeta = (text: string, params?: any[]) => metaPool.query(text, params);
export const queryWeb = (text: string, params?: any[]) => webPool.query(text, params);
