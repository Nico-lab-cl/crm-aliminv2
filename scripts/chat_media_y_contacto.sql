-- Adjuntos del chat (imagen, audio y video) + marca de contacto del asesor
-- + escalamiento de seguimiento a 5 min / 30 min / 1 dia.
--
-- CORRER ESTO ANTES DE DESPLEGAR EL CODIGO NUEVO.
-- Si el codigo sube primero, Prisma le pide a la base una tabla y cuatro
-- columnas que no existen y falla toda la bandeja de entrada, incluidas las
-- conversaciones de Messenger e Instagram.
--
-- Es aditivo e idempotente: se puede correr varias veces sin efecto extra y no
-- toca ningun dato existente. No usar "prisma db push" en produccion, porque
-- ante cualquier desvio del esquema puede llegar a borrar columnas.
--
-- BASE DE DATOS: "crm" (la del CRM de asesores), NO "aliminspa".
-- En el .env es DATABASE_URL, no EXTERNAL_DB_URL.
--
--   postgresql://<usuario>:<clave>@n8n_db-crm:5432/crm
--
-- Ejecutar desde el VPS, entrando al contenedor de Postgres:
--   docker exec -i n8n_db-crm psql -U <usuario> -d crm < scripts/chat_media_y_contacto.sql
--
-- O desde el contenedor del CRM, que ya tiene DATABASE_URL cargada:
--   psql "$DATABASE_URL" -f scripts/chat_media_y_contacto.sql


-- ---------------------------------------------------------------------------
-- 1. Adjuntos de mensajes
-- ---------------------------------------------------------------------------
-- El archivo va en BYTEA y no en base64 sobre TEXT: base64 infla un 33% cada
-- byte guardado y ademas obliga a decodificar en cada lectura.
--
-- Va en su propia tabla y no como columna de "Message" a proposito. La bandeja
-- lista cientos de mensajes por consulta; si el binario viviera en "Message",
-- cualquier SELECT sin lista explicita de columnas arrastraria megabytes de
-- audio que nadie pidio. Con la tabla aparte, el binario solo se lee cuando
-- alguien abre el adjunto.
--
-- Postgres mueve solo los valores grandes a almacenamiento TOAST y los
-- comprime, asi que la tabla "Message" no se degrada por esto.

CREATE TABLE IF NOT EXISTS "MessageMedia" (
    "id"         TEXT PRIMARY KEY,
    "messageId"  TEXT NOT NULL,
    "kind"       TEXT NOT NULL,         -- 'image', 'audio' o 'video'
    "mimeType"   TEXT NOT NULL,
    "fileName"   TEXT,
    "sizeBytes"  INTEGER NOT NULL,
    "durationMs" INTEGER,               -- Duracion del audio o video, si el emisor la informo
    "data"       BYTEA NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un mensaje lleva a lo mas un adjunto. El UNIQUE es ademas lo que le permite
-- a Prisma modelar la relacion como uno a uno.
CREATE UNIQUE INDEX IF NOT EXISTS "MessageMedia_messageId_key"
    ON "MessageMedia" ("messageId");

-- Borrar el mensaje se lleva su adjunto: sin el mensaje, el binario es basura
-- inalcanzable ocupando espacio.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MessageMedia_messageId_fkey'
    ) THEN
        ALTER TABLE "MessageMedia"
            ADD CONSTRAINT "MessageMedia_messageId_fkey"
            FOREIGN KEY ("messageId") REFERENCES "Message"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- El binario ya viene comprimido en origen (JPEG, WEBM/Opus, MP4). Pedirle a
-- Postgres que lo vuelva a comprimir gasta CPU en cada escritura para no ganar
-- casi nada, asi que se guarda en TOAST sin comprimir.
ALTER TABLE "MessageMedia" ALTER COLUMN "data" SET STORAGE EXTERNAL;


-- ---------------------------------------------------------------------------
-- 2. Marca de contacto del asesor
-- ---------------------------------------------------------------------------
-- Hasta ahora el CRM solo sabia si un lead tenia dueño, no si alguien lo habia
-- atendido de verdad. Estas columnas registran esa segunda cosa, que es la que
-- apaga los recordatorios de seguimiento.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "contacted"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "contactedAt"   TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "contactedById" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Lead_contactedById_fkey'
    ) THEN
        ALTER TABLE "Lead"
            ADD CONSTRAINT "Lead_contactedById_fkey"
            FOREIGN KEY ("contactedById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Escalamiento de seguimiento
-- ---------------------------------------------------------------------------
-- Contador del ultimo recordatorio enviado:
--   0 = ninguno, 1 = aviso de 5 minutos, 2 = de 30 minutos, 3 = de 1 dia.
--
-- Es un contador y no tres banderas separadas para que el cron no pueda
-- saltarse un paso ni repetir uno ya enviado: avanza de a uno y solo hacia
-- adelante.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "followupStage" INTEGER NOT NULL DEFAULT 0;

-- Los leads que ya existen no deben disparar una avalancha de recordatorios
-- atrasados apenas se despliegue esto. Todo lo anterior a este momento se marca
-- como escalamiento terminado (3) y queda fuera del cron.
--
-- Ojo: esto se ejecuta una sola vez de verdad. Al correr el script de nuevo,
-- los leads nuevos ya no cumpliran la condicion de "createdAt anterior al
-- despliegue" porque la comparacion es contra su propia fecha de creacion.
UPDATE "Lead"
SET "followupStage" = 3
WHERE "followupStage" = 0
  AND "createdAt" < NOW() - INTERVAL '2 days';

-- El cron busca leads pendientes cada minuto. Sin este indice, esa consulta
-- recorre la tabla "Lead" completa 1.440 veces al dia.
CREATE INDEX IF NOT EXISTS "Lead_followup_idx"
    ON "Lead" ("contacted", "followupStage", "createdAt");


-- ---------------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------------
-- Debe devolver una fila con la tabla y cuatro filas con las columnas nuevas.

SELECT 'tabla' AS que, table_name AS nombre
FROM information_schema.tables
WHERE table_name = 'MessageMedia'
UNION ALL
SELECT 'columna Lead', column_name
FROM information_schema.columns
WHERE table_name = 'Lead'
  AND column_name IN ('contacted', 'contactedAt', 'contactedById', 'followupStage')
ORDER BY 1, 2;
