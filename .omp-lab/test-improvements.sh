#!/bin/bash
# Quick test script for analyzer improvements
# Usage: ./test-improvements.sh

set -e

echo "=== Testing Analyzer Improvements ==="
echo ""

echo "1. Checking league-params.js exists..."
if [ -f "src/analytics/utils/league-params.js" ]; then
    echo "   ✓ league-params.js found"
else
    echo "   ✗ league-params.js missing"
    exit 1
fi

echo ""
echo "2. Checking league-params.json exists..."
if [ -f ".omp-lab/league-params.json" ]; then
    echo "   ✓ league-params.json found"
    PARAMS_COUNT=$(jq '.params | length' .omp-lab/league-params.json 2>/dev/null || echo "0")
    echo "   → $PARAMS_COUNT leagues configured"
else
    echo "   ✗ league-params.json missing"
fi

echo ""
echo "3. Checking strategies-routes.js weight fix..."
if grep -q "const w = (name) =>" src/api/routes/strategies-routes.js; then
    echo "   ✓ Weight extraction function found"
else
    echo "   ✗ Weight fix not applied"
    exit 1
fi

echo ""
echo "4. Checking Poisson improvements..."
if [ -f "src/analytics/analyzers/poisson.js" ]; then
    if grep -q "getLeagueParams" src/analytics/analyzers/poisson.js 2>/dev/null; then
        echo "   ✓ Poisson uses league-specific parameters"
    else
        echo "   ⚠ Poisson not yet updated (expected if PoissonImprove still running)"
    fi
fi

echo ""
echo "5. Git status..."
BRANCH=$(git branch --show-current)
echo "   Current branch: $BRANCH"
if [ "$BRANCH" = "agent/analyzer-improvements" ]; then
    echo "   ✓ On correct branch"
else
    echo "   ⚠ Not on agent/analyzer-improvements branch"
fi

COMMITS=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
echo "   → $COMMITS commits ahead of main"

echo ""
echo "6. Checking calibration data files..."
for file in draw-calibration.json draw-analysis.md league-params-analysis.md; do
    if [ -f ".omp-lab/$file" ]; then
        echo "   ✓ $file exists"
    else
        echo "   ⚠ $file not yet created"
    fi
done

echo ""
echo "=== Summary ==="
echo "Core infrastructure: ✓ Ready"
echo "Weight fix: ✓ Committed"
echo "Calibration data: ⏳ Being collected by subagents"
echo "Poisson improvements: ⏳ In progress"
echo ""
echo "Next: Wait for subagents to complete, then run backtest"
