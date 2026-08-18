#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

EC2_HOST="18.134.138.1"
EC2_USER="ubuntu"
EC2_KEY="$PROJECT_ROOT/keys/arb-key-london.pem"

chmod 400 "$EC2_KEY" 2>/dev/null || true

exec ssh -i "$EC2_KEY" \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  "${EC2_USER}@${EC2_HOST}"
