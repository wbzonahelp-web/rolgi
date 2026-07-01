#!/bin/bash
# Phase 1.2 Final Backtest Runner
# Runs 14 tests (7 leagues x 2 seasons) via HTTPS through nginx/traefik

API_URL="https://rolgi.com/api/strategies/backtest"
AUTH_KEY="c4aa8ed6eeafa4a4210c76232b0a62ef63a62ae287bd628a16db655a4b402076"

LEAGUES=(
  '{"id":39,"name":"Premier League"}'
  '{"id":140,"name":"La Liga"}'
  '{"id":135,"name":"Serie A"}'
  '{"id":78,"name":"Bundesliga"}'
  '{"id":61,"name":"Ligue 1"}'
  '{"id":88,"name":"Eredivisie"}'
  '{"id":128,"name":"Liga Profesional Argentina"}'
)

SEASONS=(2023 2024)

CONFIG='{"n_window":20,"venue_filter":true,"league_filter":true,"analyzers":[{"name":"poisson","weight":0.6,"enabled":true},{"name":"markov_outcome","weight":0.15,"enabled":true},{"name":"form_inertia","weight":0.1,"enabled":true}]}'

RESULTS_JSON=""
TOTAL_ACCURACY=0
TOTAL_TESTS=0
TOTAL_DRAW_PRED=0
TOTAL_DRAW_HITS=0

echo "=== Phase 1.2 Final Backtest ==="
echo "Timestamp: $(date -u +%Y%m%d-%H%M%S)"
echo ""

for league_entry in "${LEAGUES[@]}"; do
  LEAGUE_ID=$(echo "$league_entry" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  LEAGUE_NAME=$(echo "$league_entry" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")

  for SEASON in "${SEASONS[@]}"; do
    LABEL="${LEAGUE_NAME} ${SEASON}"
    echo -n "Running: ${LABEL}... "

    BODY=$(python3 -c "import json; print(json.dumps({'config': ${CONFIG}, 'league_id': ${LEAGUE_ID}, 'season': ${SEASON}, 'limit': 100}))")

    RESPONSE=$(curl -sLk -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $AUTH_KEY" \
      -d "$BODY" 2>&1)

    if [ $? -ne 0 ] || echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
      SUMMARY=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['data']['summary']
bo = s['by_outcome']
draw_pred = bo.get('DRAW', {}).get('predicted', 0)
draw_hits = bo.get('DRAW', {}).get('hits', 0)
print(f'{s[\"accuracy\"]}|{draw_pred}|{draw_hits}')
" 2>/dev/null)

      ACC=$(echo "$SUMMARY" | cut -d'|' -f1)
      DP=$(echo "$SUMMARY" | cut -d'|' -f2)
      DH=$(echo "$SUMMARY" | cut -d'|' -f3)

      echo "accuracy=${ACC}%, draw_pred=${DP}, draw_hits=${DH}"
      TOTAL_ACCURACY=$((TOTAL_ACCURACY + ACC))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
      TOTAL_DRAW_PRED=$((TOTAL_DRAW_PRED + DP))
      TOTAL_DRAW_HITS=$((TOTAL_DRAW_HITS + DH))

      RESULTS_JSON="${RESULTS_JSON}${RESULTS_JSON:+,}{\"league\":\"${LEAGUE_NAME}\",\"league_id\":${LEAGUE_ID},\"season\":${SEASON},\"accuracy\":${ACC},\"draw_predicted\":${DP},\"draw_hits\":${DH}}"
    else
      echo "ERROR: $(echo "$RESPONSE" | head -c 200)"
    fi
  done
done

AVG_ACCURACY=$((TOTAL_TESTS > 0 ? TOTAL_ACCURACY / TOTAL_TESTS : 0))
DRAW_HIT_RATE=$(python3 -c "print(round(${TOTAL_DRAW_HITS} / ${TOTAL_DRAW_PRED} * 1000) / 10 if ${TOTAL_DRAW_PRED} > 0 else 0)")

echo ""
echo "=== Phase 1.2 Final Summary ==="
echo "Total tests: ${TOTAL_TESTS}"
echo "Average accuracy: ${AVG_ACCURACY}%"
echo "Total DRAW predicted: ${TOTAL_DRAW_PRED}"
echo "Total DRAW hits: ${TOTAL_DRAW_HITS}"
echo "DRAW hit rate: ${DRAW_HIT_RATE}%"

TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)

FINAl_JSON=$(python3 -c "
import json
out = {
  'run_type': 'phase1.2-final',
  'timestamp': '${TIMESTAMP}',
  'avg_accuracy': ${AVG_ACCURACY},
  'total_tests': ${TOTAL_TESTS},
  'total_draw_predicted': ${TOTAL_DRAW_PRED},
  'total_draw_hits': ${TOTAL_DRAW_HITS},
  'draw_hit_rate': ${DRAW_HIT_RATE},
  'results': [${RESULTS_JSON}]
}
print(json.dumps(out, indent=2))
")

FILENAME="/srv/projects/rolgi/.omp-lab/runs/phase1.2-final-${TIMESTAMP}.json"
echo "$FINAl_JSON" > "$FILENAME"
echo ""
echo "Results saved to: ${FILENAME}"
