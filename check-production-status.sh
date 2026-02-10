#!/bin/bash

# Production Server Status Check Script
# Rolgi SStats Analytics Platform v5.0.0

echo "========================================="
echo "🔍 Rolgi Production Server Status Check"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Docker containers
echo "📦 Docker Containers:"
echo "---"
sudo docker compose ps 2>/dev/null | tail -n +2 || echo "❌ Docker not running"
echo ""

# Check Node processes
echo "🔧 Node Processes:"
echo "---"
ps aux | grep -E "node (server|test-flashscore)" | grep -v grep || echo "❌ No Node processes found"
echo ""

# Check listening ports
echo "🌐 Listening Ports:"
echo "---"
sudo ss -tulpn | grep -E ":300[01]|:5432|:6379" || echo "❌ No ports listening"
echo ""

# Health checks
echo "💓 Health Checks:"
echo "---"

# API Health
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:3001/health | jq -r '.status' 2>/dev/null)
    if [ "$HEALTH" = "healthy" ]; then
        echo -e "${GREEN}✅ API Server (3001): Healthy${NC}"
    else
        echo -e "${YELLOW}⚠️  API Server (3001): Unknown status${NC}"
    fi
else
    echo -e "${RED}❌ API Server (3001): Not responding${NC}"
fi

# Database Health
if sudo docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL: Connected${NC}"
else
    echo -e "${RED}❌ PostgreSQL: Connection failed${NC}"
fi

# Redis Health
if sudo docker exec rolgi-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis: Connected${NC}"
else
    echo -e "${RED}❌ Redis: Connection failed${NC}"
fi

echo ""

# Test endpoints
echo "🎯 Endpoint Tests:"
echo "---"

# Test live games
LIVE_GAMES=$(curl -s "http://localhost:3001/api/flashscore/games/live?Limit=1" | jq -r '.success' 2>/dev/null)
if [ "$LIVE_GAMES" = "true" ]; then
    COUNT=$(curl -s "http://localhost:3001/api/flashscore/games/live?Limit=1" | jq -r '.data | length' 2>/dev/null)
    echo -e "${GREEN}✅ Flashscore Live Games: Working ($COUNT games)${NC}"
else
    echo -e "${RED}❌ Flashscore Live Games: Failed${NC}"
fi

# Test today games
TODAY_GAMES=$(curl -s "http://localhost:3001/api/flashscore/games/today?Limit=1" | jq -r '.success' 2>/dev/null)
if [ "$TODAY_GAMES" = "true" ]; then
    COUNT=$(curl -s "http://localhost:3001/api/flashscore/games/today?Limit=1" | jq -r '.data | length' 2>/dev/null)
    echo -e "${GREEN}✅ Today's Games: Working ($COUNT games)${NC}"
else
    echo -e "${RED}❌ Today's Games: Failed${NC}"
fi

# Test teams
TEAMS=$(curl -s "http://localhost:3001/api/teams/list?Limit=1" | jq -r 'length' 2>/dev/null)
if [ "$TEAMS" -gt 0 ] 2>/dev/null; then
    echo -e "${GREEN}✅ Teams API: Working ($TEAMS teams)${NC}"
else
    echo -e "${RED}❌ Teams API: Failed${NC}"
fi

echo ""
echo "========================================="
echo "✅ Status check complete!"
echo "========================================="
