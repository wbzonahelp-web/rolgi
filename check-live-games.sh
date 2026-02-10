#!/bin/bash

echo "=================================================="
echo "🔍 ПРОВЕРКА LIVE GAMES UI"
echo "=================================================="
echo ""

echo "📋 Файлы:"
ls -lh public/live-games.html public/index.html 2>/dev/null | tail -2
echo ""

echo "🌐 Доступность страниц:"
echo ""

echo "1️⃣ Главная страница:"
curl -sI https://rolgi.com/ | grep -E "HTTP|content-length"
echo ""

echo "2️⃣ Live Games:"
curl -sI https://rolgi.com/live-games.html | grep -E "HTTP|content-length"
echo ""

echo "3️⃣ API Endpoint:"
curl -s https://rolgi.com/api/flashscore/games/live | jq -r '"\(.success) - \(.data | length) games"' 2>/dev/null || echo "Failed to parse JSON"
echo ""

echo "🐳 Docker контейнеры:"
sudo docker ps --filter "name=rolgi" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -5
echo ""

echo "📊 Git Status:"
cd /home/ubuntu/webapp && git log --oneline -5
echo ""

echo "=================================================="
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
echo "=================================================="
echo ""
echo "🌟 Основные ссылки:"
echo "   Главная:    https://rolgi.com/"
echo "   Live Games: https://rolgi.com/live-games.html"
echo "   API:        https://rolgi.com/api/flashscore/games/live"
echo ""
