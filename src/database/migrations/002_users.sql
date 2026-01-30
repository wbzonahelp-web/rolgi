-- ============================================================
-- USERS TABLE MIGRATION
-- ============================================================
-- Таблица пользователей для аутентификации и авторизации
-- 
-- Роли:
-- - admin: полный доступ
-- - analyst: чтение + запуск loader
-- - viewer: только чтение
--
-- Created: 2026-01-30
-- ============================================================

-- Создаём enum для ролей
CREATE TYPE user_role AS ENUM ('admin', 'analyst', 'viewer');

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Индексы
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Trigger для updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- Комментарии
COMMENT ON TABLE users IS 'Таблица пользователей системы с JWT аутентификацией';
COMMENT ON COLUMN users.user_id IS 'Уникальный идентификатор пользователя';
COMMENT ON COLUMN users.username IS 'Имя пользователя (уникальное)';
COMMENT ON COLUMN users.email IS 'Email пользователя (уникальный)';
COMMENT ON COLUMN users.password_hash IS 'Хеш пароля (bcrypt)';
COMMENT ON COLUMN users.role IS 'Роль пользователя: admin, analyst, viewer';
COMMENT ON COLUMN users.is_active IS 'Флаг активности пользователя';
COMMENT ON COLUMN users.created_at IS 'Дата создания';
COMMENT ON COLUMN users.updated_at IS 'Дата последнего обновления';
COMMENT ON COLUMN users.last_login_at IS 'Дата последнего входа';

-- Вставка дефолтного admin пользователя
-- Password: admin123 (хеш bcrypt с rounds=10)
-- ВАЖНО: Измените пароль сразу после первого входа!
INSERT INTO users (username, email, password_hash, role, is_active)
VALUES (
  'admin',
  'admin@rolgi.local',
  '$2b$10$qXZFqKpXeVjTlRvGZVyaWOKZy5qWGx7PxBqCzRp9X8RvJXhQyHZ2G', 
  'admin',
  true
) ON CONFLICT (username) DO NOTHING;

-- Статистика
SELECT 
  'Users table created with ' || COUNT(*) || ' default user(s)' AS status
FROM users;
