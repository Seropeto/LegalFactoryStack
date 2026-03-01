-- Legal Factory Beta - PostgreSQL Schema Initialization
-- Generated for: Toxiro Digital

CREATE SCHEMA IF NOT EXISTS evolution;

-- 1. Clientes Table
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    rut VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    telefono VARCHAR(50),
    clave VARCHAR(255), -- Hash de acceso para el portal de cliente
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Expedientes Table
CREATE TABLE IF NOT EXISTS expedientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    n_causa VARCHAR(100) NOT NULL, -- ROL o RIT
    tribunal VARCHAR(255),
    estado VARCHAR(50) DEFAULT 'Pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Actuaciones Table (Timeline)
CREATE TABLE IF NOT EXISTS actuaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    bitacora TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Plazos Table (Deadlines & Alerts)
CREATE TABLE IF NOT EXISTS plazos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
    vencimiento TIMESTAMP WITH TIME ZONE NOT NULL,
    alerta BOOLEAN DEFAULT FALSE,
    titulo VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Documentos Table (File Management)
CREATE TABLE IF NOT EXISTS documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    archivo UUID NOT NULL, -- Relación con directus_files
    expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Indices for performance
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON clientes(rut);
CREATE INDEX IF NOT EXISTS idx_expedientes_n_causa ON expedientes(n_causa);
CREATE INDEX IF NOT EXISTS idx_actuaciones_expediente ON actuaciones(expediente_id);
CREATE INDEX IF NOT EXISTS idx_plazos_vencimiento ON plazos(vencimiento);
CREATE INDEX IF NOT EXISTS idx_documentos_expediente ON documentos(expediente_id);
