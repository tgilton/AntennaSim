#!/bin/bash
# Stops AntennaSim's backend (:8001) and frontend (:5174) dev servers.

BACKEND_PORT=8001
FRONTEND_PORT=5174

stop_port() {
    local port=$1
    local name=$2
    local pids=$(lsof -ti tcp:$port)
    if [ -n "$pids" ]; then
        echo "Stopping $name (pid $pids)..."
        kill $pids
        for i in $(seq 1 10); do
            lsof -ti tcp:$port > /dev/null 2>&1 || { echo "  stopped."; return; }
            sleep 1
        done
        local still=$(lsof -ti tcp:$port)
        if [ -n "$still" ]; then
            echo "  still up after 10s, forcing..."
            kill -9 $still 2>/dev/null
        fi
    else
        echo "$name not running."
    fi
}

stop_port $BACKEND_PORT "AntennaSim backend"
stop_port $FRONTEND_PORT "AntennaSim frontend"

echo "Done."
