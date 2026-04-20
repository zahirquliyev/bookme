-- ============================================
-- CallCenter SaaS - Database Schema
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- PLANS (tarif planları)
-- ============================================
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,           -- 'starter', 'pro', 'enterprise'
    display_name VARCHAR(100) NOT NULL,
    max_agents INT NOT NULL DEFAULT 3,
    max_numbers INT NOT NULL DEFAULT 2,
    max_calls_per_month INT DEFAULT 1000,
    price_monthly DECIMAL(10,2) NOT NULL,
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO plans (name, display_name, max_agents, max_numbers, max_calls_per_month, price_monthly, features) VALUES
('starter',    'Starter',    3,  2,  500,   29.99, '{"recording": false, "analytics": false, "api_access": false}'),
('pro',        'Pro',        10, 5,  2000,  79.99, '{"recording": true,  "analytics": true,  "api_access": false}'),
('enterprise', 'Enterprise', 50, 20, 99999, 199.99,'{"recording": true,  "analytics": true,  "api_access": true}');

-- ============================================
-- TENANTS (müştəri biznesləri)
-- ============================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,          -- 'restaurant-firuze'
    plan_id UUID REFERENCES plans(id),
    owner_email VARCHAR(255) UNIQUE NOT NULL,
    owner_name VARCHAR(200),
    timezone VARCHAR(50) DEFAULT 'Asia/Baku',
    locale VARCHAR(10) DEFAULT 'az',
    is_active BOOLEAN DEFAULT TRUE,
    trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days'),
    subscription_ends_at TIMESTAMP,
    settings JSONB DEFAULT '{}',               -- custom settings
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- USERS (admin + agent accounts)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    role VARCHAR(20) DEFAULT 'agent',           -- 'owner', 'admin', 'agent'
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ============================================
-- AGENTS (call center operatorları)
-- ============================================
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    extension VARCHAR(10) UNIQUE NOT NULL,     -- '1001', '1002'
    sip_username VARCHAR(100) UNIQUE NOT NULL,
    sip_password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'offline',      -- 'online', 'offline', 'busy', 'paused'
    max_concurrent_calls INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PHONE NUMBERS (GSM + VoIP nömrələri)
-- ============================================
CREATE TABLE phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL,               -- '+994501234567'
    display_number VARCHAR(20),                -- '050-123-45-67'
    type VARCHAR(10) NOT NULL,                 -- 'gsm', 'voip'
    provider VARCHAR(50),                      -- 'azercell', 'bakcell', 'nar', 'twilio', 'zadarma'
    is_primary BOOLEAN DEFAULT FALSE,
    is_fallback BOOLEAN DEFAULT FALSE,
    gsm_port INT,                              -- GoIP port number
    voip_did VARCHAR(50),                      -- Twilio/Zadarma DID
    status VARCHAR(20) DEFAULT 'active',       -- 'active', 'inactive', 'error'
    monthly_cost DECIMAL(8,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- QUEUES (zəng növbələri)
-- ============================================
CREATE TABLE queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    asterisk_name VARCHAR(50) UNIQUE NOT NULL, -- 'q_tenant_firuze'
    strategy VARCHAR(30) DEFAULT 'ringall',    -- 'ringall', 'roundrobin', 'leastrecent'
    timeout INT DEFAULT 20,                    -- saniyə
    max_wait INT DEFAULT 120,
    music_on_hold VARCHAR(50) DEFAULT 'default',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Queue <-> Agent mapping
CREATE TABLE queue_agents (
    queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    penalty INT DEFAULT 0,
    PRIMARY KEY (queue_id, agent_id)
);

-- ============================================
-- CALLS (zəng loqu)
-- ============================================
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    asterisk_uniqueid VARCHAR(100),            -- Asterisk unique ID
    caller_number VARCHAR(20) NOT NULL,
    called_number VARCHAR(20) NOT NULL,
    agent_id UUID REFERENCES agents(id),
    queue_id UUID REFERENCES queues(id),
    call_type VARCHAR(10),                     -- 'gsm', 'voip'
    direction VARCHAR(10) DEFAULT 'inbound',   -- 'inbound', 'outbound'
    status VARCHAR(20),                        -- 'answered', 'missed', 'abandoned', 'voicemail'
    started_at TIMESTAMP DEFAULT NOW(),
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INT DEFAULT 0,
    wait_time_seconds INT DEFAULT 0,
    recording_url VARCHAR(500),
    notes TEXT,
    metadata JSONB DEFAULT '{}'
);

-- ============================================
-- WORKING HOURS (iş saatları)
-- ============================================
CREATE TABLE working_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL,                  -- 0=Sunday, 1=Monday...
    open_time TIME NOT NULL DEFAULT '09:00',
    close_time TIME NOT NULL DEFAULT '22:00',
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- SESSIONS (JWT refresh tokens)
-- ============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_calls_tenant_id ON calls(tenant_id);
CREATE INDEX idx_calls_started_at ON calls(started_at);
CREATE INDEX idx_calls_caller ON calls(caller_number);
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_phone_numbers_tenant ON phone_numbers(tenant_id);

-- ============================================
-- UPDATED_AT trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DEMO TENANT (test data)
-- ============================================
INSERT INTO tenants (name, slug, owner_email, owner_name) VALUES
('Restaurant Demo', 'restaurant-demo', 'demo@callcenter.az', 'Demo Admin');
