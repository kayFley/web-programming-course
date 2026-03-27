#!/usr/bin/env bash

set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-3000}"
BASE="http://${HOST}:${PORT}"
MAX_RETRIES=15
RETRY_INTERVAL=2

echo "Waiting for backend at ${BASE} ..."
for i in $(seq 1 ${MAX_RETRIES}); do
  if curl -sf "${BASE}/health" > /dev/null 2>&1; then
    echo "Backend is up (attempt ${i})"
    break
  fi
  if [ "${i}" -eq "${MAX_RETRIES}" ]; then
    echo "Backend did not respond after $((MAX_RETRIES * RETRY_INTERVAL))s"
    exit 1
  fi
  sleep "${RETRY_INTERVAL}"
done

echo ""
echo "▶ GET /health"
HEALTH=$(curl -sf "${BASE}/health")
echo "  Response: ${HEALTH}"
echo "${HEALTH}" | grep -q '"ok"' || { echo "/health did not return ok"; exit 1; }
echo "/health OK"

echo ""
echo "▶ GET /api/auth/me (no token → expect 401)"
STATUS=$(curl -o /dev/null -sw "%{http_code}" "${BASE}/api/auth/me")
echo "  HTTP status: ${STATUS}"
[ "${STATUS}" = "401" ] || { echo "Expected 401, got ${STATUS}"; exit 1; }
echo "Auth guard OK"

echo ""
echo "▶ GET /nonexistent (→ expect 404)"
STATUS=$(curl -o /dev/null -sw "%{http_code}" "${BASE}/nonexistent")
echo "  HTTP status: ${STATUS}"
[ "${STATUS}" = "404" ] || { echo "Expected 404, got ${STATUS}"; exit 1; }
echo "404 handler OK"

echo ""
echo "All smoke checks passed."
