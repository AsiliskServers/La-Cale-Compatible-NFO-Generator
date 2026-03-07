#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/La-Cale-Compatible-NFO-Generator}"
AUTO_UPDATE_GITHUB="${AUTO_UPDATE_GITHUB:-true}"
AUTO_UPDATE_BRANCH="${AUTO_UPDATE_BRANCH:-}"

is_truthy() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "on" ]]
}

if ! is_truthy "${AUTO_UPDATE_GITHUB}"; then
  echo "[auto-update] Disabled (AUTO_UPDATE_GITHUB=${AUTO_UPDATE_GITHUB})."
  exit 0
fi

for required in git npm node; do
  if ! command -v "${required}" >/dev/null 2>&1; then
    echo "[auto-update] Missing '${required}', skipping update."
    exit 0
  fi
done

if [[ ! -d "${APP_DIR}" ]]; then
  echo "[auto-update] App directory not found: ${APP_DIR}"
  exit 0
fi

cd "${APP_DIR}"

if [[ ! -d ".git" ]]; then
  echo "[auto-update] .git missing in ${APP_DIR}, skipping update."
  exit 0
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[auto-update] Git remote 'origin' missing, skipping update."
  exit 0
fi

branch="${AUTO_UPDATE_BRANCH}"
if [[ -z "${branch}" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
if [[ -z "${branch}" || "${branch}" == "HEAD" ]]; then
  branch="main"
fi

echo "[auto-update] Syncing branch '${branch}' from origin..."
git fetch --prune origin "${branch}"

local_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "origin/${branch}")"

if [[ "${local_commit}" == "${remote_commit}" ]]; then
  echo "[auto-update] Already up to date (${local_commit})."
  exit 0
fi

git pull --ff-only origin "${branch}"

echo "[auto-update] Installing dependencies and rebuilding..."
npm ci
npm run build
npm prune --omit=dev

echo "[auto-update] Update applied: ${local_commit} -> ${remote_commit}"
