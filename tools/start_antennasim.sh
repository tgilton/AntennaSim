#!/bin/bash
# Starts AntennaSim (FastAPI backend on :8001 + Vite frontend on :5174)
# without Docker — Docker Desktop has been broken on this machine, and the
# no-Docker path is the one confirmed working (see
# AntennaSim/.claude/skills/launch-antennasim/SKILL.md).

APP_DIR="$HOME/AntennaSim"
BACKEND_PORT=8001
FRONTEND_PORT=5174

# A different local project (antenna_char) uses 8000/5173 — make sure
# nothing foreign is squatting on AntennaSim's ports before we start.
existing_backend=$(lsof -ti tcp:$BACKEND_PORT)
if [ -n "$existing_backend" ]; then
    echo "Stopping existing process on :$BACKEND_PORT (PID $existing_backend)..."
    kill -9 $existing_backend 2>/dev/null
    sleep 1
fi

existing_frontend=$(lsof -ti tcp:$FRONTEND_PORT)
if [ -n "$existing_frontend" ]; then
    echo "Stopping existing process on :$FRONTEND_PORT (PID $existing_frontend)..."
    kill -9 $existing_frontend 2>/dev/null
    sleep 1
fi

mkdir -p /tmp/nec_workdir

echo "Starting AntennaSim backend..."
cd "$APP_DIR/backend"
source ../venv/bin/activate
export ENVIRONMENT=development \
       ALLOWED_ORIGINS=http://localhost:$FRONTEND_PORT \
       REDIS_URL=redis://localhost:6379 \
       LOG_LEVEL=debug \
       SIM_TIMEOUT_SECONDS=180 \
       NEC_WORKDIR=/tmp/nec_workdir \
       RATE_LIMIT_ENABLED=false \
       ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../.env | cut -d= -f2-)
nohup uvicorn src.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload \
    > /tmp/antennasim-backend.log 2>&1 &
disown

echo "Waiting for backend on :$BACKEND_PORT..."
for i in $(seq 1 30); do
    if curl -s http://localhost:$BACKEND_PORT/api/v1/health > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

if curl -s http://localhost:$BACKEND_PORT/api/v1/health > /dev/null 2>&1; then
    echo "Backend up on :$BACKEND_PORT."
else
    echo "WARNING: backend did not respond within 15s — check /tmp/antennasim-backend.log"
fi

echo "Starting AntennaSim frontend..."
cd "$APP_DIR/frontend"
VITE_API_URL=http://localhost:$BACKEND_PORT VITE_WS_URL=ws://localhost:$BACKEND_PORT \
    nohup npm run dev -- --port $FRONTEND_PORT > /tmp/antennasim-frontend.log 2>&1 &
disown

echo "Waiting for frontend on :$FRONTEND_PORT..."
for i in $(seq 1 30); do
    if lsof -i tcp:$FRONTEND_PORT > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

if lsof -i tcp:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "Frontend started. Opening AntennaSim..."
    open -a "Google Chrome" http://localhost:$FRONTEND_PORT
else
    echo "Frontend failed to start within 15s — check /tmp/antennasim-frontend.log"
fi

echo "AntennaSim is running. Use ~/stop_antennasim.sh when finished."
