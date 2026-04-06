import { PrismaClient } from '@prisma/client';

/**
 * Client for the external Reservation database (db-alimin)
 * Uses the connection string provided for real-time querying
 */
const globalForExternalPrisma = global as unknown as { externalPrisma: PrismaClient };

export const externalPrisma =
  globalForExternalPrisma.externalPrisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.EXTERNAL_RESERVATION_DB_URL || "postgres://alimin:alimin2026@72.62.11.186:5432/db-alimin?sslmode=disable",
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForExternalPrisma.externalPrisma = externalPrisma;

export default externalPrisma;
