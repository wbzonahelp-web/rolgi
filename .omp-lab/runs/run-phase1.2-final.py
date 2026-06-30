#!/usr/bin/env python3
"""Phase 1.2 Final Backtest Runner - runs via nginx/traefik through rolgi.com"""
import json
import urllib.request
import time
import os
from datetime import datetime, timezone

API_URL = "https://rolgi.com/api/strategies/backtest"
AUTH_KEY = "c4aa8ed6eeafa4a4210c76232b0a62ef63a62ae287bd628a16db655a4b402076"

LEAGUES = [
    (39, "Premier League"),
    (140, "La Liga"),
    (135, "Serie A"),
    (78, "Bundesliga"),
    (61, "Ligue 1"),
    (88, "Eredivisie"),
    (128, "Liga Profesional Argentina"),
]
SEASONS = [2023, 2024]

CONFIG = {
    "n_window": 20,
    "venue_filter": True,
    "league_filter": True,
    "analyzers": [
        {"name": "poisson", "weight": 0.6, "enabled": True},
        {"name": "markov_outcome", "weight": 0.15, "enabled": True},
        {"name": "form_inertia", "weight": 0.1, "enabled": True},
    ],
}

def run_backtest(league_id, season, limit=100):
    body = json.dumps({
        "config": CONFIG,
        "league_id": league_id,
        "season": season,
        "limit": limit,
    }).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AUTH_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

results = []
total_accuracy = 0
total_tests = 0
total_draw_pred = 0
total_draw_hits = 0

timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
print(f"=== Phase 1.2 Final Backtest ===")
print(f"Timestamp: {timestamp}")
print()

for league_id, league_name in LEAGUES:
    for season in SEASONS:
        label = f"{league_name} {season}"
        print(f"Running: {label}...", end=" ", flush=True)
        try:
            raw = run_backtest(league_id, season)
            s = raw["data"]["summary"]
            bo = s.get("by_outcome", {})
            draw_pred = bo.get("DRAW", {}).get("predicted", 0)
            draw_hits = bo.get("DRAW", {}).get("hits", 0)
            accuracy = s["accuracy"]
            hits = s["hits"]
            misses = s["misses"]

            results.append({
                "league": league_name,
                "league_id": league_id,
                "season": season,
                "accuracy": accuracy,
                "hits": hits,
                "misses": misses,
                "draw_predicted": draw_pred,
                "draw_hits": draw_hits,
            })
            total_accuracy += accuracy
            total_tests += 1
            total_draw_pred += draw_pred
            total_draw_hits += draw_hits
            print(f"accuracy={accuracy}%, draw_pred={draw_pred}, draw_hits={draw_hits}")
        except Exception as e:
            print(f"ERROR: {e}")
            results.append({
                "league": league_name,
                "league_id": league_id,
                "season": season,
                "accuracy": 0,
                "hits": 0,
                "misses": 0,
                "draw_predicted": 0,
                "draw_hits": 0,
                "error": str(e),
            })
        time.sleep(0.2)  # small throttle

avg_accuracy = round(total_accuracy / total_tests) if total_tests > 0 else 0
draw_hit_rate = round(total_draw_hits / total_draw_pred * 1000) / 10 if total_draw_pred > 0 else 0.0

print()
print("=== Phase 1.2 Final Summary ===")
print(f"Total tests: {total_tests}")
print(f"Average accuracy: {avg_accuracy}%")
print(f"Total DRAW predicted: {total_draw_pred}")
print(f"Total DRAW hits: {total_draw_hits}")
print(f"DRAW hit rate: {draw_hit_rate}%")

output = {
    "run_type": "phase1.2-final",
    "timestamp": timestamp,
    "avg_accuracy": avg_accuracy,
    "total_tests": total_tests,
    "total_draw_predicted": total_draw_pred,
    "total_draw_hits": total_draw_hits,
    "draw_hit_rate": draw_hit_rate / 100 if draw_hit_rate else 0,
    "results": results,
}

filename = f"/srv/projects/rolgi/.omp-lab/runs/phase1.2-final-{timestamp}.json"
os.makedirs(os.path.dirname(filename), exist_ok=True)
with open(filename, "w") as f:
    json.dump(output, f, indent=2)
print(f"\nResults saved to: {filename}")
