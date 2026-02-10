#!/bin/bash

# Rolgi Server Deployment Plan v5.0.0
# Date: 2026-01-31
# Purpose: Complete server update with latest changes

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         Rolgi Server Production Deployment v5.0.0             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORK_DIR="/home/ubuntu/webapp"
PORT=3001
OLD_PORT=3000

cd $WORK_DIR

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Checking current git status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git status --short

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Pulling latest changes from GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git fetch origin genspark_ai_developer
git checkout genspark_ai_developer
git pull origin genspark_ai_developer

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Checking environment configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
    grep "PORT=" .env || echo "PORT=$PORT" >> .env
else
    echo -e "${RED}✗${NC} .env file not found, creating..."
    cp .env.example .env 2>/dev/null || touch .env
    echo "PORT=$PORT" >> .env
    echo "API_PORT=$PORT" >> .env
    echo "API_HOST=0.0.0.0" >> .env
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Installing/updating dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm install --production

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Checking current running processes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check processes on ports
echo "Checking port $PORT..."
PID_NEW=$(lsof -ti:$PORT 2>/dev/null || echo "")
if [ ! -z "$PID_NEW" ]; then
    echo -e "${YELLOW}⚠${NC}  Process found on port $PORT (PID: $PID_NEW)"
else
    echo -e "${GREEN}✓${NC} Port $PORT is free"
fi

echo "Checking port $OLD_PORT..."
PID_OLD=$(lsof -ti:$OLD_PORT 2>/dev/null || echo "")
if [ ! -z "$PID_OLD" ]; then
    echo -e "${YELLOW}⚠${NC}  Process found on port $OLD_PORT (PID: $PID_OLD)"
else
    echo -e "${GREEN}✓${NC} Port $OLD_PORT is free"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 6: Stopping old servers (if any)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop test server on 3001
if [ ! -z "$PID_NEW" ]; then
    echo "Stopping process on port $PORT (PID: $PID_NEW)..."
    kill -15 $PID_NEW 2>/dev/null || sudo kill -15 $PID_NEW 2>/dev/null || true
    sleep 2
    # Force kill if still running
    if ps -p $PID_NEW > /dev/null 2>&1; then
        echo "Force killing..."
        kill -9 $PID_NEW 2>/dev/null || sudo kill -9 $PID_NEW 2>/dev/null || true
    fi
    echo -e "${GREEN}✓${NC} Stopped"
fi

# Stop old server on 3000
if [ ! -z "$PID_OLD" ]; then
    echo "Stopping process on port $OLD_PORT (PID: $PID_OLD)..."
    kill -15 $PID_OLD 2>/dev/null || sudo kill -15 $PID_OLD 2>/dev/null || true
    sleep 2
    # Force kill if still running
    if ps -p $PID_OLD > /dev/null 2>&1; then
        echo "Force killing..."
        kill -9 $PID_OLD 2>/dev/null || sudo kill -9 $PID_OLD 2>/dev/null || true
    fi
    echo -e "${GREEN}✓${NC} Stopped"
fi

sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 7: Starting new server on port $PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check which server file to use
if [ -f "test-flashscore-server.js" ]; then
    SERVER_FILE="test-flashscore-server.js"
else
    SERVER_FILE="server.js"
fi

echo "Using server file: $SERVER_FILE"

# Start server in background
PORT=$PORT nohup node $SERVER_FILE > server.log 2>&1 &
NEW_PID=$!

echo "Started server with PID: $NEW_PID"
sleep 5

# Check if server is running
if ps -p $NEW_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Server is running (PID: $NEW_PID)"
else
    echo -e "${RED}✗${NC} Server failed to start"
    echo "Last 20 lines of server.log:"
    tail -20 server.log
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 8: Health check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Waiting for server to be ready..."
sleep 5

HEALTH_RESPONSE=$(curl -s http://localhost:$PORT/health || echo "")

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC} Server is healthy!"
    echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${RED}✗${NC} Health check failed"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 9: Testing endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test Flashscore API
echo "Testing Flashscore API..."
FLASHSCORE_TEST=$(curl -s "http://localhost:$PORT/api/flashscore/games/live?Limit=1" || echo "")
if echo "$FLASHSCORE_TEST" | grep -q '"id"'; then
    echo -e "${GREEN}✓${NC} Flashscore API working"
else
    echo -e "${YELLOW}⚠${NC}  Flashscore API response: $FLASHSCORE_TEST"
fi

# Test Games API
echo "Testing Games API..."
GAMES_TEST=$(curl -s "http://localhost:$PORT/api/games/live?Limit=1" || echo "")
if echo "$GAMES_TEST" | grep -q '"success"'; then
    echo -e "${GREEN}✓${NC} Games API working"
else
    echo -e "${YELLOW}⚠${NC}  Games API response: $GAMES_TEST"
fi

# Test Teams API
echo "Testing Teams API..."
TEAMS_TEST=$(curl -s "http://localhost:$PORT/api/teams/list?Limit=1" || echo "")
if echo "$TEAMS_TEST" | grep -q '"success"'; then
    echo -e "${GREEN}✓${NC} Teams API working"
else
    echo -e "${YELLOW}⚠${NC}  Teams API response: $TEAMS_TEST"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                  Deployment Successful! ✓                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Server Information:"
echo "  • Status: Running (PID: $NEW_PID)"
echo "  • Port: $PORT"
echo "  • API URL: http://158.69.195.140:$PORT"
echo "  • Swagger: http://158.69.195.140:$PORT/docs"
echo "  • Health: http://158.69.195.140:$PORT/health"
echo ""
echo "Logs:"
echo "  • Live: tail -f server.log"
echo "  • Last 50: tail -50 server.log"
echo ""
echo "Management:"
echo "  • Stop: kill $NEW_PID"
echo "  • Restart: kill $NEW_PID && PORT=$PORT node $SERVER_FILE &"
echo ""
