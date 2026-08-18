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
SSH=(ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no)
RSYNC_SSH="ssh -i '$EC2_KEY' -o StrictHostKeyChecking=no"

chmod 400 "$EC2_KEY" 2>/dev/null || true

"${SSH[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR/server' '$REMOTE_DIR/src' '$REMOTE_DIR/scripts'"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/server/" "$REMOTE:$REMOTE_DIR/server/"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/src/net/" "$REMOTE:$REMOTE_DIR/src/net/"

rsync -az --delete -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/src/shared/" "$REMOTE:$REMOTE_DIR/src/shared/"

rsync -az -e "$RSYNC_SSH" \
  "$PROJECT_ROOT/scripts/settlers-matchhost.service" \
  "$REMOTE:$REMOTE_DIR/scripts/settlers-matchhost.service"

"${SSH[@]}" "$REMOTE" bash -s << 'REMOTE'
set -euo pipefail
cd /home/ubuntu/settlers-match
cp server/package.json package.json
cp server/tsconfig.json tsconfig.json
npm install --omit=dev
sudo cp scripts/settlers-matchhost.service /etc/systemd/system/settlers-matchhost.service
sudo systemctl daemon-reload
sudo systemctl enable --now settlers-matchhost
sudo systemctl restart settlers-matchhost
sleep 1
curl -sf http://127.0.0.1:8787/api/health
echo
sudo systemctl is-active settlers-matchhost
REMOTE

if command -v aws >/dev/null 2>&1; then
  aws ec2 authorize-security-group-ingress \
    --region eu-west-2 \
    --group-id sg-0ae99a69cf8d1d325 \
    --protocol tcp \
    --port 8787 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1 || true
fi

echo "MatchHost http://${EC2_HOST}:8787/api/health"
curl -sf --max-time 5 "http://${EC2_HOST}:8787/api/health" && echo || echo "public 8787 still closed — open TCP 8787 on sg-0ae99a69cf8d1d325"
