#!/usr/bin/env bash
# Task 56 — run a Playwright chunk against a throwaway dev server.
#
# The sandbox reaps background processes when a tool call ends, so the
# server and the tests must share one call (the same "fresh servers in
# chunks" pattern the Phase 11 regression used).
#
# Usage: task56-e2e-chunk.sh <spec-file> [<spec-file> ...]
set -u
cd /home/z/my-project

# Start the dev server on a scratch port (3000 free-standing).
PORT=3000
npx next dev -p "$PORT" > dev-e2e.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
}
trap cleanup EXIT

# Wait for readiness (curl also warms the landing compile).
ready=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" --max-time 5)
  if [ "$code" = "200" ]; then ready=1; break; fi
  sleep 2
done
if [ "$ready" != "1" ]; then
  echo "SERVER FAILED TO START — dev-e2e.log tail:"
  tail -20 dev-e2e.log
  exit 2
fi
echo "server ready (pid $SERVER_PID)"

npx playwright test "$@"
exit $?
