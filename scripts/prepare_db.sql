-- 1. Agregar columnas a la tabla "Lead" en Main DB (aliminspa)
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "pie" VARCHAR(255);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "monthlyPayment" VARCHAR(255);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditInterest" VARCHAR(255);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredChannel" VARCHAR(255);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "inboxUrl" TEXT;

-- 2. Insertar asesores en la tabla "User" para evitar fallos de Foreign Key
INSERT INTO "User" (id, name, username, role, password, "createdAt", "updatedAt") VALUES
('44444444-4444-4444-4444-444444444444', 'Alimin', 'alimin', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
('55555555-5555-5555-5555-555555555555', 'Cami Poblete Yout', 'cami.poblete', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
('66666666-6666-6666-6666-666666666666', 'Cindy Gutierrez', 'cindy.gutierrez', 'ASESOR', 'placeholder_pw', NOW(), NOW()),
('77777777-7777-7777-7777-777777777777', 'S X G', 'sxg', 'ASESOR', 'placeholder_pw', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
