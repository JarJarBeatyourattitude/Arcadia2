#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [ ! -d "apps/web/node_modules" ]; then
  echo "Installing web dependencies..."
  (cd apps/web && npm install)
fi

VENV_DIR="$ROOT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

REQ_HASH_FILE="$ROOT_DIR/.venv/.requirements_hash"
REQ_HASH=$(shasum -a 256 apps/api/requirements.txt | awk '{print $1}')

if [ ! -f "$REQ_HASH_FILE" ] || [ "$(cat "$REQ_HASH_FILE")" != "$REQ_HASH" ]; then
  echo "Installing API dependencies..."
  "$VENV_DIR/bin/pip" install -r apps/api/requirements.txt
  echo "$REQ_HASH" > "$REQ_HASH_FILE"
fi

cleanup() {
  echo "Shutting down..."
  kill 0
}
trap cleanup EXIT

pick_port() {
  local port
  for port in 8000 8001 8002 8003; do
    if ! lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$port"
      return
    fi
  done
  echo "8000"
}

API_PORT=$(pick_port)
export NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}"

(
  cd "$ROOT_DIR/apps/api"
  "$VENV_DIR/bin/uvicorn" apps.api.main:app \
    --reload \
    --reload-dir "." \
    --port "$API_PORT" \
    --app-dir "$ROOT_DIR"
) &

cd apps/web
npm run dev
