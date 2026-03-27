#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

IMAGE_NAME="quiz-backend"
PREVIOUS_TAG_FILE="${PROJECT_DIR}/.previous-tag"

if [ -n "${1:-}" ]; then
  ROLLBACK_TAG="${1}"
elif [ -f "${PREVIOUS_TAG_FILE}" ]; then
  ROLLBACK_TAG="$(cat "${PREVIOUS_TAG_FILE}")"
  [ -n "${ROLLBACK_TAG}" ] || { echo " .previous-tag is empty"; exit 1; }
else
  echo "No rollback target found."
  echo "   Pass a tag explicitly: bash scripts/rollback-local.sh <tag>"
  echo "   Or run local-release.sh first so it can save the current tag."
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Rolling back to ${IMAGE_NAME}:${ROLLBACK_TAG}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! podman image exists "${IMAGE_NAME}:${ROLLBACK_TAG}"; then
  echo " Image ${IMAGE_NAME}:${ROLLBACK_TAG} not found locally."
  echo "   Available tags:"
  podman images "${IMAGE_NAME}" --format "  {{.Tag}}"
  exit 1
fi

echo ""
echo "▶ Re-tagging ${IMAGE_NAME}:${ROLLBACK_TAG} → ${IMAGE_NAME}:local"
podman tag "${IMAGE_NAME}:${ROLLBACK_TAG}" "${IMAGE_NAME}:local"

echo ""
echo "▶ Restarting compose stack"
podman compose down --remove-orphans 2>/dev/null || true
podman compose up -d
echo "   Stack restarted"

echo ""
echo "▶ Smoke check"
bash "${SCRIPT_DIR}/healthcheck.sh"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Rollback to ${ROLLBACK_TAG} complete."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
