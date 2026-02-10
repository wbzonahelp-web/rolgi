#!/bin/bash
# Check historical sync status

echo "=== Historical Sync Status ==="
echo ""

# Check if process is running
PID=$(pgrep -f "historical-sync" | head -1)
if [ -n "$PID" ]; then
    echo "✅ Sync process running (PID: $PID)"
    
    # Get last log line
    if [ -f /home/ubuntu/webapp/historical-sync.log ]; then
        echo ""
        echo "📋 Last progress:"
        tail -1 /home/ubuntu/webapp/historical-sync.log
    fi
else
    echo "❌ Sync process not running"
    
    # Check if completed
    if grep -q "SYNC COMPLETE" /home/ubuntu/webapp/historical-sync.log 2>/dev/null; then
        echo "✅ Sync completed!"
        tail -20 /home/ubuntu/webapp/historical-sync.log | grep -E "Duration|Days|Games|Teams|Database"
    fi
fi

echo ""
echo "📊 Database status:"
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -t -c "
SELECT 
  'Games: ' || COUNT(*) || 
  ' | Earliest: ' || MIN(date)::date || 
  ' | Latest: ' || MAX(date)::date ||
  ' | Teams: ' || (SELECT COUNT(*) FROM teams)
FROM games;"

echo ""
echo "📈 Games by year:"
docker exec rolgi-postgres psql -U postgres -d rolgi_v6 -c "
SELECT EXTRACT(YEAR FROM date)::int as year, COUNT(*) as games
FROM games
GROUP BY year
ORDER BY year DESC;"
