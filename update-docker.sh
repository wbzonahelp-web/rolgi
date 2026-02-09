#!/bin/bash

# Rolgi Docker Update Script
# Date: 2026-01-31
# Purpose: Update Docker container with latest code

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║            Rolgi Docker Container Update v5.0.0               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /home/ubuntu/webapp

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Pulling latest changes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git pull origin genspark_ai_developer

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Stopping test server on port 3001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PID_3001=$(lsof -ti:3001 2>/dev/null || echo "")
if [ ! -z "$PID_3001" ]; then
    echo "Stopping process on port 3001 (PID: $PID_3001)..."
    kill -9 $PID_3001 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Stopped"
else
    echo -e "${GREEN}✓${NC} No process on port 3001"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Stopping Docker containers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sudo docker-compose down

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Rebuilding Docker image"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sudo docker-compose build --no-cache rolgi-api

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Starting Docker containers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sudo docker-compose up -d

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 6: Waiting for services to be ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sleep 10

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 7: Checking container status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sudo docker-compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 8: Health checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking port 3000 (Docker)..."
HEALTH_3000=$(curl -s http://localhost:3000/health || echo "")
if echo "$HEALTH_3000" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC} Docker API is healthy!"
else
    echo -e "${YELLOW}⚠${NC}  Docker API response: $HEALTH_3000"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 9: Testing endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Flashscore API..."
FLASHSCORE_TEST=$(curl -s "http://localhost:3000/api/flashscore/games/live?Limit=1" || echo "")
if echo "$FLASHSCORE_TEST" | grep -q '"id"'; then
    echo -e "${GREEN}✓${NC} Flashscore API working"
else
    echo -e "${YELLOW}⚠${NC}  Flashscore API may need time to initialize"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 10: Starting standalone server on port 3001"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "test-flashscore-server.js" ]; then
    PORT=3001 nohup node test-flashscore-server.js > server.log 2>&1 &
    NEW_PID=$!
    echo "Started standalone server with PID: $NEW_PID"
    sleep 5
    
    HEALTH_3001=$(curl -s http://localhost:3001/health || echo "")
    if echo "$HEALTH_3001" | grep -q "healthy"; then
        echo -e "${GREEN}✓${NC} Standalone server is healthy!"
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                  Docker Update Complete! ✓                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Services:"
echo "  • Docker API (Port 3000): http://158.69.195.140:3000"
echo "  • Standalone API (Port 3001): http://158.69.195.140:3001"
echo "  • Swagger: http://158.69.195.140:3000/docs"
echo "  • Nginx: http://158.69.195.140"
echo ""
echo "Container Logs:"
echo "  • All: sudo docker-compose logs -f"
echo "  • API: sudo docker-compose logs -f rolgi-api"
echo ""
