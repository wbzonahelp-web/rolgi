#!/bin/bash

echo "Testing failed endpoints..."
echo ""

echo "1. Testing /api/flashscore/games (with filters)"
curl -s "http://localhost:3001/api/flashscore/games?Limit=5" | jq -c '{success, error, errors}' 
echo ""

echo "2. Testing /api/flashscore/games/range"
curl -s "http://localhost:3001/api/flashscore/games/range?From=2026-01-01&To=2026-01-31&Limit=5" | jq -c '{success, error, errors}'
echo ""

echo "3. Testing /api/teams/search"
curl -s "http://localhost:3001/api/teams/search?query=Liverpool&limit=5" | jq -c '{success, error, errors}'
echo ""

echo "4. Testing /api/odds/live-updates"
curl -s "http://localhost:3001/api/odds/live-updates?gameIds=1461496,1461497" | jq -c '{success, error, errors}'
echo ""

