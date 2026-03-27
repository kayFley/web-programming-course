#!/usr/bin/env bash


set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

IMAGE_NAME="quiz-backend"
PREVIOUS_TAG_FILE="${PROJECT_DIR}/.previous-tag"

if [ -n "${1:-}" ]; then
  NEW_TAG="${1}"
else
  if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    NEW_TAG="$(git rev-parse --short HEAD)"
  else
    NEW_TAG="$(date +%Y%m%d-%H%M%S)"
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Local Release — tag: ${NEW_TAG}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT_TAG="$(podman inspect --format '{{index .Config.Labels "quiz-tag"}}' quiz-backend 2>/dev/null || true)"
if [ -n "${CURRENT_TAG}" ]; then
  echo "${CURRENT_TAG}" > "${PREVIOUS_TAG_FILE}"
  echo "Saved previous tag: ${CURRENT_TAG}"
fi

echo ""
echo "▶ Step 1/4 — Lint & test"
bun run test
echo "   Tests passed"

echo ""
echo "▶ Step 2/4 — Build image ${IMAGE_NAME}:${NEW_TAG}"
podman build \
  --format docker \
  --label "quiz-tag=${NEW_TAG}" \
  -t "${IMAGE_NAME}:${NEW_TAG}" \
  -t "${IMAGE_NAME}:local" \
  .
echo "   Image built"

echo ""
echo "▶ Step 3/4 — Start compose stack"
if [ ! -f "${PROJECT_DIR}/.env.container" ]; then
  echo "  ⚠️  .env.container not found — generating from .env"
  grep -v DATABASE_URL "${PROJECT_DIR}/.env" | sed 's/"//g' > "${PROJECT_DIR}/.env.container"
  echo "DATABASE_URL=file:/app/data/quiz.db" >> "${PROJECT_DIR}/.env.container"
fi
podman compose down --remove-orphans 2>/dev/null || true
podman compose up -d
echo "   Stack started"

echo ""
echo "▶ Step 4/4 — Smoke check"
bash "${SCRIPT_DIR}/healthcheck.sh"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Release ${NEW_TAG} complete."
echo "   Logs:     podman compose logs -f backend"
echo "   Rollback: bash scripts/rollback-local.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
