-- Chat web de aliminspa.cl: columnas de presencia del visitante.
--
-- CORRER ESTO ANTES DE DESPLEGAR EL CODIGO NUEVO.
-- Si el codigo sube primero, Prisma le pide a la base dos columnas que no
-- existen y falla toda la bandeja de entrada, incluidas las conversaciones
-- de Messenger e Instagram.
--
-- Es aditivo e idempotente: se puede correr varias veces sin efecto extra y
-- no toca ningun dato existente. No usar "prisma db push" en produccion,
-- porque ante cualquier desvio del esquema puede llegar a borrar columnas.
--
-- Ejecutar contra la base "crm", por ejemplo desde el contenedor:
--   psql "$DATABASE_URL" -f scripts/chat_web_columns.sql

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "visitorLastSeenAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "visitorNotifiedAt" TIMESTAMP(3);

-- Verificacion: deben aparecer las dos filas.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Conversation'
  AND column_name IN ('visitorLastSeenAt', 'visitorNotifiedAt');
