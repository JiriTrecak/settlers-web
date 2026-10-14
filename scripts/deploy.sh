#!/usr/bin/env bash
# Sync MatchHost to EC2 and restart systemd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

EC2_HOST="18.134.138.1"
EC2_USER="ubuntu"
EC2_KEY="$PROJECT_ROOT/keys/arb-key-london.pem"
REMOTE="${EC2_USER}@${EC2_HOST}"
REMOTE_DIR="/home/ubuntu/settlers-match"
SSH=(ssh -i "$EC2_KEY" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -i '$EC2_KEY' -o StrictHostKeyChecking=accept-new"

chmod 400 "$EC2_KEY" 2>/dev/null || true

# Never deploy a loopback-only service without its public TLS front end.
"${SSH[@]}" "$REMOTE" "sudo test -s /etc/letsencrypt/live/canopy-matchhost/fullchain.pem && sudo nginx -t" || {
  echo 'Configure HTTPS first: infrastructure/multiplayer/README.md' >&2
  exit 1
}

"${SSH[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR/server' '$REMOTE_DIR/src' '$REMOTE_DIR/scripts' '$REMOTE_DIR/content'"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/server/" "$REMOTE:$REMOTE_DIR/server/"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/src/net/" "$REMOTE:$REMOTE_DIR/src/net/"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/src/shared/" "$REMOTE:$REMOTE_DIR/src/shared/"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/src/content/" "$REMOTE:$REMOTE_DIR/src/content/"

rsync -az -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/content/game.json" "$REMOTE:$REMOTE_DIR/content/game.json"

rsync -az -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/scripts/settlers-matchhost.service" \
  "$REMOTE:$REMOTE_DIR/scripts/settlers-matchhost.service"
rsync -az -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/infrastructure/multiplayer/nginx.conf" \
  "$REMOTE:$REMOTE_DIR/scripts/matchhost-nginx.conf"

"${SSH[@]}" "$REMOTE" bash -s << 'REMOTE'
set -euo pipefail
cd /home/ubuntu/settlers-match
cp server/package.json package.json
cp server/tsconfig.json tsconfig.json
npm install --omit=dev
sudo cp scripts/settlers-matchhost.service /etc/systemd/system/settlers-matchhost.service
sudo systemctl daemon-reload
sudo cp scripts/matchhost-nginx.conf /etc/nginx/sites-available/canopy-matchhost
sudo ln -sfn /etc/nginx/sites-available/canopy-matchhost /etc/nginx/sites-enabled/canopy-matchhost
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now settlers-matchhost
sudo systemctl restart settlers-matchhost
for attempt in {1..20}; do
  if curl -sf http://127.0.0.1:8787/api/health; then break; fi
  sleep 1
done
curl -sf http://127.0.0.1:8787/api/health
echo
sudo systemctl is-active settlers-matchhost
REMOTE

echo "MatchHost https://${EC2_HOST}/api/health"
curl -fsS --max-time 10 "https://${EC2_HOST}/api/health"
echo
