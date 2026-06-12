-- Script de migración para las tablas de firmas de correo electrónico y métricas de clics

-- Tabla de firmas de correo electrónico
CREATE TABLE IF NOT EXISTS email_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    personal_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    styling JSONB NOT NULL DEFAULT '{}'::jsonb,
    html_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabla de registro de clics en las firmas
CREATE TABLE IF NOT EXISTS signature_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id UUID REFERENCES email_signatures(id) ON DELETE CASCADE,
    element VARCHAR(100) NOT NULL, -- e.g., 'website', 'email', 'phone', 'instagram', 'facebook', 'linkedin', 'whatsapp', etc.
    destination_url TEXT NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    browser VARCHAR(100),
    os VARCHAR(100),
    device VARCHAR(100),
    referrer TEXT,
    country VARCHAR(100),
    city VARCHAR(100),
    region VARCHAR(100),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
);

-- Índices para optimizar consultas de reporte analítico
CREATE INDEX IF NOT EXISTS idx_signature_clicks_signature_id ON signature_clicks(signature_id);
CREATE INDEX IF NOT EXISTS idx_signature_clicks_clicked_at ON signature_clicks(clicked_at);
CREATE INDEX IF NOT EXISTS idx_signature_clicks_element ON signature_clicks(element);
