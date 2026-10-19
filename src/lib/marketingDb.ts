import { Pool } from "pg";

/**
 * Base crm_marketing (la del CRM web): actividad web del rastreador de
 * aliminspa.cl y correos de las campañas.
 *
 * Vive en el mismo servidor y con el mismo usuario que la base crm de este
 * CRM, así que por defecto se usa DATABASE_URL cambiando solo el nombre de la
 * base. MARKETING_DB_URL lo reemplaza si algún día se separan.
 */
function urlMarketing(): string {
  if (process.env.MARKETING_DB_URL) return process.env.MARKETING_DB_URL;
  const base = process.env.DATABASE_URL || "";
  try {
    const url = new URL(base);
    url.pathname = "/crm_marketing";
    return url.toString();
  } catch {
    return base;
  }
}

let pool: Pool | null = null;

export function queryMarketing(text: string, params?: unknown[]) {
  if (!pool) {
    pool = new Pool({ connectionString: urlMarketing(), max: 5, connectionTimeoutMillis: 5000 });
    pool.on("error", (err) => console.error("[marketingDb] error en conexión inactiva:", err.message));
  }
  return pool.query(text, params);
}
