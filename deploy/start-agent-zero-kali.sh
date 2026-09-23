#!/usr/bin/env bash
# Run ON the Hermes VPS (or via ssh from a Tailscale/Windows host).
# Cursor Cloud cannot reach 100.118.230.116.
set -euo pipefail

REPO="${HERMES_REPO:-/opt/hermes-memory-os}"
FILE="$REPO/docker-compose.agent-zero-kali.yml"
HOST="${HERMES_HOST:-100.118.230.116}"

if [[ ! -f "$FILE" ]]; then
  echo "MISSING $FILE"
  echo "Copy Publisher-Pro/deploy/docker-compose.agent-zero-kali.yml to the VPS first:"
  echo "  scp deploy/docker-compose.agent-zero-kali.yml root@$HOST:$FILE"
  exit 2
fi

mkdir -p /opt/agent-zero/usr
cd "$REPO"
docker compose -f "$FILE" up -d

echo
echo "Agent Zero:  http://$HOST:50080"
echo "Kali noVNC:  https://$HOST:6901"
echo "Kali login:  kasm_user / password  (set VNC_PW in the compose file)"
echo "Qdrant on 6333 is untouched."
