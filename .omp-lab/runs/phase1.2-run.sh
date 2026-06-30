#!/bin/bash
# Phase 1.2 Draw Boost Calibration Backtest Runner
# Runs 14 tests: 7 leagues x 2 seasons x 100 matches
# Designed to run via: sudo agent-exec rolgi-api bash /tmp/phase1.2-run.sh
# OR directly: bash .omp-lab/runs/phase1.2-run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
OUTPUT_DIR=".omp-lab/runs"
mkdir -p "$OUTPUT_DIR"

LEAGUES=(
  "39:Premier League"
  "140:La Liga"
  "135:Serie A"
  "78:Bundesliga"
  "61:Ligue 1"
  "88:Eredivisie"
  "128:Liga Profesional Argentina"
)

SEASONS=(2023 2024)

API_URL="${API_URL:-http://localhost:3000}"

CONFIG='{
  "n_window": 20,
  "venue_filter": true,
  "league_filter": true,
  "analyzers": [
    {"name": "poisson", "weight": 0.6, "enabled": true},
    {"name": "markov_outcome", "weight": 0.15, "enabled": true},
    {"name": "form_inertia", "weight": 0.1, "enabled": true}
  ]
}'

echo "=== Phase 1.2 Draw Boost Calibration Backtest ==="
echo "Timestamp: $TIMESTAMP"
echo "Output: $OUTPUT_DIR/phase1.2-drawboost-calibration-$TIMESTAMP.json"
echo ""

ALL_RESULTS="[]"
TOTAL_ACCURACY=0
TOTAL_TESTS=0

for league_entry in "${LEAGUES[@]}"; do
  IFS=':' read -r league_id league_name <<< "$league_entry"
  
  for season in "${SEASONS[@]}"; do
    echo "Testing: $league_name ($league_id) - Season $season"
    
    RESULT=$(curl -s -X POST "$API_URL/api/strategies/backtest" \
      -H "Content-Type: application/json" \
      -d "{
        \"config\": $CONFIG,
        \"league_id\": $league_id,
        \"season\": $season,
        \"limit\": 100
      }")
    
    if [ $? -eq 0 ] && echo "$RESULT" | jq -e '.success == true' > /dev/null 2>&1; then
      ACCURACY=$(echo "$RESULT" | jq -r '.data.summary.accuracy // 0')
      HITS=$(echo "$RESULT" | jq -r '.data.summary.hits // 0')
      MISSES=$(echo "$RESULT" | jq -r '.data.summary.misses // 0')
      DRAW_PRED=$(echo "$RESULT" | jq -r '.data.summary.by_outcome.DRAW.predicted // 0')
      DRAW_HITS=$(echo "$RESULT" | jq -r '.data.summary.by_outcome.DRAW.hits // 0')
      
      echo "  → Accuracy: ${ACCURACY}% (${HITS}/${MISSES} M, DRAW predicted: $DRAW_PRED, DRAW hits: $DRAW_HITS)"
      
      TOTAL_ACCURACY=$((TOTAL_ACCURACY + ACCURACY))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
      
      TEST_ENTRY=$(jq -n \
        --arg league "$league_name" \
        --argjson league_id "$league_id" \
        --argjson season "$season" \
        --argjson accuracy "$ACCURACY" \
        --argjson hits "$HITS" \
        --argjson misses "$MISSES" \
        --argjson draw_pred "$DRAW_PRED" \
        --argjson draw_hits "$DRAW_HITS" \
        '{league: $league, league_id: $league_id, season: $season, accuracy: $accuracy, hits: $hits, misses: $misses, draw_predicted: $draw_pred, draw_hits: $draw_hits}')
      
      ALL_RESULTS=$(echo "$ALL_RESULTS" | jq ". += [$TEST_ENTRY]")
    else
      echo "  → ERROR: Failed to run backtest"
      echo "  → Response: $RESULT"
    fi
    
    sleep 1
  done
  echo ""
done

# Calculate summary
AVG_ACCURACY=$((TOTAL_ACCURACY / TOTAL_TESTS))
TOTAL_DRAW_PRED=$(echo "$ALL_RESULTS" | jq '[.[].draw_predicted] | add')
TOTAL_DRAW_HITS=$(echo "$ALL_RESULTS" | jq '[.[].draw_hits] | add')

if [ "$TOTAL_DRAW_PRED" -gt 0 ] 2>/dev/null; then
  DRAW_HIT_RATE=$(echo "scale=4; $TOTAL_DRAW_HITS / $TOTAL_DRAW_PRED" | bc)
  DRAW_HIT_RATE_PCT=$(echo "scale=1; $DRAW_HIT_RATE * 100" | bc)
else
  DRAW_HIT_RATE=0
  DRAW_HIT_RATE_PCT=0
fi

echo "=== Summary ==="
echo "Total tests: $TOTAL_TESTS"
echo "Average accuracy: ${AVG_ACCURACY}%"
echo "Total DRAW predicted: $TOTAL_DRAW_PRED"
echo "Total DRAW hits: $TOTAL_DRAW_HITS"
echo "DRAW hit rate: ${DRAW_HIT_RATE_PCT}%"
echo ""

# Save results
FINAL_OUTPUT=$(jq -n \
  --arg timestamp "$TIMESTAMP" \
  --argjson avg_accuracy "$AVG_ACCURACY" \
  --argjson total_tests "$TOTAL_TESTS" \
  --argjson total_draw_pred "$TOTAL_DRAW_PRED" \
  --argjson total_draw_hits "$TOTAL_DRAW_HITS" \
  --argjson draw_hit_rate "$DRAW_HIT_RATE" \
  --argjson results "$ALL_RESULTS" \
  '{run_type: "phase1.2-drawboost-calibration", timestamp: $timestamp, avg_accuracy: $avg_accuracy, total_tests: $total_tests, total_draw_predicted: $total_draw_pred, total_draw_hits: $total_draw_hits, draw_hit_rate: $draw_hit_rate, results: $results}')

echo "$FINAL_OUTPUT" > "$OUTPUT_DIR/phase1.2-drawboost-calibration-$TIMESTAMP.json"
echo "Results saved to: $OUTPUT_DIR/phase1.2-drawboost-calibration-$TIMESTAMP.json"
