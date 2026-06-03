-- Script para crear la tabla de almacenamiento de mensajes de WhatsApp
-- Esta tabla vive en MARKETING_DB

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
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id ON whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(timestamp);
