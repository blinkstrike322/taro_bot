#!/bin/bash
set -e
cd "$(dirname "$0")"

# Kill old processes
pkill -f "python3 app.py" 2>/dev/null || true
pkill -f "nokey@localhost.run" 2>/dev/null || true
pkill -f "autossh" 2>/dev/null || true
sleep 1

echo "Starting HTTPS tunnel via localhost.run..."

# Start tunnel with autossh for auto-reconnect
autossh -M 0 \
  -o "ServerAliveInterval 30" \
  -o "ServerAliveCountMax 3" \
  -o StrictHostKeyChecking=no \
  -R 80:localhost:8080 nokey@localhost.run &>/tmp/localtunnel.log &

# Wait for tunnel URL
sleep 10
TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.lhr\.life' /tmp/localtunnel.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "ERROR: Could not get tunnel URL"
    cat /tmp/localtunnel.log
    exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# Update .env and set env var for bot
sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" .env
export WEBAPP_URL="$TUNNEL_URL"

echo "Starting bot @amotaro_bot..."
python3 app.py &
BOT_PID=$!

echo ""
echo "=== ALL RUNNING ==="
echo "Bot: @amotaro_bot"
echo "WebApp: $TUNNEL_URL"
echo "Press Ctrl+C to stop both"
echo ""

cleanup() {
    echo "Stopping..."
    kill $BOT_PID 2>/dev/null
    pkill -f "autossh" 2>/dev/null
    wait
}
trap cleanup EXIT INT TERM

wait $BOT_PID
