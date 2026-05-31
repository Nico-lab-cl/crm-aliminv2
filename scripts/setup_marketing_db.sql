-- Script de inicialización para la base de datos de marketing (MARKETING_DB)

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertar usuario admin inicial (contraseña: chris.2026)
-- Nota: En producción esto debería cambiarse
INSERT INTO users (username, password_hash)
VALUES ('admin', 'chris.2026')
ON CONFLICT (username) DO NOTHING;

-- Tabla de campañas
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    mjml_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de logs de campaña (Tracking de envíos)
CREATE TABLE IF NOT EXISTS campaign_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id),
    lead_id UUID NOT NULL, -- ID del Lead en la MAIN_DB
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, SENT, DELIVERED, OPENED, BOUNCED, REPLIED
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    last_callback_at TIMESTAMP WITH TIME ZONE,
    is_test BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar la velocidad de búsqueda de logs
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_lead_id ON campaign_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_id ON campaign_logs(campaign_id);
