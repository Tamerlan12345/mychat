-- Corporate Chat (Holding Chat) Supabase Initial Schema Migration
-- Migration: 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PROFILES (Extends auth.users or standalone user table)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(50),
    position VARCHAR(255),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OFFLINE', -- ONLINE, OFFLINE, AWAY, DO_NOT_DISTURB, BLOCKED
    role VARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE',   -- SUPER_ADMIN, ADMIN, MODERATOR, EMPLOYEE
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CONVERSATIONS (DIRECT, GROUP, CHANNEL)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL, -- DIRECT, GROUP, CHANNEL
    name VARCHAR(255),
    avatar_url TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CONVERSATION MEMBERS
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'MEMBER', -- ADMIN, MEMBER
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_message_id UUID,
    PRIMARY KEY (conversation_id, user_id)
);

-- 5. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'TEXT', -- TEXT, FILE, IMAGE, SYSTEM
    reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key for last_read_message_id after messages table is created
ALTER TABLE conversation_members 
    ADD CONSTRAINT fk_last_read_message 
    FOREIGN KEY (last_read_message_id) 
    REFERENCES messages(id) ON DELETE SET NULL;

-- 6. MESSAGE REACTIONS
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction VARCHAR(50) NOT NULL, -- e.g. 👍, ❤️, 🔥
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id, reaction)
);

-- 7. ATTACHMENTS
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL, -- max 52428800 bytes (50MB)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. USER SETTINGS
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    notifications BOOLEAN DEFAULT TRUE,
    mentions_only BOOLEAN DEFAULT FALSE,
    theme VARCHAR(50) DEFAULT 'dark',
    language VARCHAR(10) DEFAULT 'ru',
    telegram_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. BRANDING CONFIG (Dynamic White-Label Engine)
CREATE TABLE IF NOT EXISTS branding_config (
    id INT PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(255) NOT NULL DEFAULT 'Centras Chat',
    app_title VARCHAR(255) NOT NULL DEFAULT 'Corporate Messenger',
    logo_url TEXT DEFAULT '',
    logo_small_url TEXT DEFAULT '',
    favicon_url TEXT DEFAULT '',
    primary_color VARCHAR(50) DEFAULT '#2563eb',
    secondary_color VARCHAR(50) DEFAULT '#475569',
    background_color VARCHAR(50) DEFAULT '#0f172a',
    login_background VARCHAR(50) DEFAULT 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- 10. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    ip VARCHAR(50) DEFAULT '127.0.0.1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. TELEGRAM ACCOUNTS
CREATE TABLE IF NOT EXISTS telegram_accounts (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    connected BOOLEAN DEFAULT FALSE,
    telegram_user_id VARCHAR(100),
    username VARCHAR(255),
    phone VARCHAR(50),
    session_encrypted TEXT,
    last_sync TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR SPEED
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
