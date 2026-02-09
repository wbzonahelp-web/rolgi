#!/bin/bash

# 🧪 Скрипт для быстрого тестирования Advanced Games Query Endpoint
# 
# Использование:
#   1. Установите API ключ: export SSTATS_API_KEY="your_key_here"
#   2. Запустите: ./quick-test-games-query.sh

set -e

echo "🚀 Starting Advanced Games Query Tests..."
echo ""

# Проверка наличия API ключа
if [ -z "$SSTATS_API_KEY" ]; then
    echo "❌ ERROR: SSTATS_API_KEY is not set"
    echo "Please set it: export SSTATS_API_KEY='your_key_here'"
    exit 1
fi

echo "✅ API Key found: ***${SSTATS_API_KEY: -4}"
echo ""

# Проверка наличия node
if ! command -v node &> /dev/null; then
    echo "❌ ERROR: Node.js is not installed"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Установка зависимостей если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Запуск тестов
echo "🧪 Running tests..."
echo ""
node tests/manual/test-games-query.js

echo ""
echo "✅ Tests completed!"
