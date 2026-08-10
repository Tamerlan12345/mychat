-- Supabase Seed Data (Tech Spec §36)

-- 1. Departments
INSERT INTO departments (id, name, description) VALUES
('d0000000-0000-0000-0000-000000000001', 'IT', 'Департамент информационных технологий'),
('d0000000-0000-0000-0000-000000000002', 'AI', 'Лаборатория искусственного интеллекта'),
('d0000000-0000-0000-0000-000000000003', 'HR', 'Управление персоналом'),
('d0000000-0000-0000-0000-000000000004', 'Management', 'Руководство компании')
ON CONFLICT (id) DO NOTHING;

-- 2. Users (Tech Spec §36)
-- Passwords for seed users: "password123"
INSERT INTO profiles (id, email, first_name, last_name, avatar_url, position, department_id, status, role) VALUES
('u0000000-0000-0000-0000-000000000001', 'admin@demo.local', 'Администратор', 'Системный', 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin', 'Chief Technology Officer', 'd0000000-0000-0000-0000-000000000001', 'ONLINE', 'SUPER_ADMIN'),
('u0000000-0000-0000-0000-000000000002', 'employee1@demo.local', 'Иван', 'Петров', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan', 'Senior AI Engineer', 'd0000000-0000-0000-0000-000000000002', 'ONLINE', 'EMPLOYEE'),
('u0000000-0000-0000-0000-000000000003', 'employee2@demo.local', 'Анна', 'Иванова', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna', 'HR Lead', 'd0000000-0000-0000-0000-000000000003', 'AWAY', 'ADMIN'),
('u0000000-0000-0000-0000-000000000004', 'employee3@demo.local', 'Сергей', 'Смирнов', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sergey', 'DevOps Specialist', 'd0000000-0000-0000-0000-000000000001', 'OFFLINE', 'EMPLOYEE')
ON CONFLICT (id) DO NOTHING;

-- 3. Branding Initial Row
INSERT INTO branding_config (id, company_name, app_title, primary_color, secondary_color, background_color) VALUES
(1, 'Centras Chat', 'Corporate Messenger MVP', '#2563eb', '#475569', '#0f172a')
ON CONFLICT (id) DO NOTHING;

-- 4. Initial Conversations (Channels & Groups)
INSERT INTO conversations (id, type, name, description, created_by, is_private) VALUES
('c0000000-0000-0000-0000-000000000001', 'CHANNEL', '📢 Новости', 'Главный новостной канал компании', 'u0000000-0000-0000-0000-000000000001', FALSE),
('c0000000-0000-0000-0000-000000000002', 'CHANNEL', '💻 IT', 'Обсуждение IT инфраструктуры и развертывания', 'u0000000-0000-0000-0000-000000000001', FALSE),
('c0000000-0000-0000-0000-000000000003', 'CHANNEL', '🤖 AI', 'Разработка AI агентов и нейросетей', 'u0000000-0000-0000-0000-000000000002', FALSE),
('c0000000-0000-0000-0000-000000000004', 'GROUP', '👥 AI Project', 'Рабочая группа проекта AI Assistant', 'u0000000-0000-0000-0000-000000000002', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Members
INSERT INTO conversation_members (conversation_id, user_id, role) VALUES
('c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'ADMIN'),
('c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000002', 'MEMBER'),
('c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000003', 'MEMBER'),
('c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000004', 'MEMBER'),
('c0000000-0000-0000-0000-000000000004', 'u0000000-0000-0000-0000-000000000001', 'ADMIN'),
('c0000000-0000-0000-0000-000000000004', 'u0000000-0000-0000-0000-000000000002', 'ADMIN'),
('c0000000-0000-0000-0000-000000000004', 'u0000000-0000-0000-0000-000000000003', 'MEMBER')
ON CONFLICT DO NOTHING;

-- Initial Seed Messages
INSERT INTO messages (id, conversation_id, sender_id, content, message_type) VALUES
('m0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'u0000000-0000-0000-0000-000000000001', 'Добро пожаловать в новый корпоративный мессенджер Centras Chat!', 'TEXT'),
('m0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'u0000000-0000-0000-0000-000000000002', 'Привет команда! Запустили стенд для тестирования интеграций.', 'TEXT')
ON CONFLICT (id) DO NOTHING;
