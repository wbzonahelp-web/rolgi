#!/bin/bash
# Apply draw calibration improvements to Poisson analyzer
# Based on .omp-lab/draw-analysis.md recommendations

set -e

echo "=== Applying Draw Calibration Improvements ==="
echo ""

POISSON_FILE="src/analytics/analyzers/poisson.js"
DRAW_CALIB_FILE=".omp-lab/draw-calibration.json"

echo "1. Checking prerequisites..."
if [ ! -f "$POISSON_FILE" ]; then
    echo "   ✗ Poisson analyzer not found"
    exit 1
fi

if [ ! -f "$DRAW_CALIB_FILE" ]; then
    echo "   ✗ Draw calibration data not found"
    exit 1
fi

echo "   ✓ All files found"
echo ""

echo "2. Current draw boost parameters:"
grep -A 2 "drawBoost.*0.3.*0.10" "$POISSON_FILE" || echo "   (pattern not found, may be already updated)"
echo ""

echo "3. Recommended changes from analysis:"
GLOBAL_BOOST=$(jq -r '.global_avg_recommended_boost' "$DRAW_CALIB_FILE")
echo "   Current max boost: 0.10 (10pp)"
echo "   Recommended global boost: $GLOBAL_BOOST (${GLOBAL_BOOST}pp)"
echo "   Multiplier needed: $(jq -r '.global_avg_multiplier' "$DRAW_CALIB_FILE")x"
echo ""

echo "4. Per-league multipliers:"
jq -r '.leagues | to_entries[] | "   \(.value.name): \(.value.multiplier)x → boost \(.value.recommended_boost)"' "$DRAW_CALIB_FILE"
echo ""

echo "5. Integration status:"
if grep -q "getLeagueDrawBoost" "$POISSON_FILE"; then
    echo "   ✓ Poisson already uses getLeagueDrawBoost()"
else
    echo "   ⚠ Poisson not yet integrated with draw boost multipliers"
fi
echo ""

echo "=== Next Steps ==="
echo "1. Ensure PoissonImprove task has completed"
echo "2. Update league-params.json with draw_boost_multiplier per league"
echo "3. Test with backtest to verify DRAW prediction improvement"
echo "4. Expected: DRAW predictions 5-26% → 20-30%"
echo "5. Expected: DRAW hit rate 0-29% → 30-40%"
