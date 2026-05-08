#!/bin/bash
# Start Vite dev server and Electron in parallel
# Kill all child processes on exit
trap 'kill 0' EXIT

# Start Vite dev server in background
npx vite &
VITE_PID=$!

# Wait for Vite to be ready
echo "Waiting for Vite dev server..."
while ! curl -s http://localhost:5173 > /dev/null 2>&1; do
  sleep 0.3
done
echo "Vite ready, launching Electron..."

# Build and start Electron
npx tsc -p tsconfig.electron.json && NODE_ENV=development npx electron . &
ELECTRON_PID=$!

wait $ELECTRON_PID
