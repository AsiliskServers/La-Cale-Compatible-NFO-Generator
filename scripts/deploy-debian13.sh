#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/deploy-debian13.sh"
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

APP_USER="${APP_USER:-nfo-generator}"
APP_GROUP="${APP_GROUP:-nfo-generator}"
APP_DIR="${APP_DIR:-/opt/La-Cale-Compatible-NFO-Generator}"
SERVICE_NAME="la-cale-compatible-nfo-generator.service"
SERVICE_SOURCE="${ROOT_DIR}/deploy/systemd/${SERVICE_NAME}"
ENV_FILE="/etc/la-cale-compatible-nfo-generator.env"
ENV_EXAMPLE_SOURCE="${ROOT_DIR}/deploy/env/la-cale-compatible-nfo-generator.env.example"

for required in rsync npm node mediainfo systemctl; do
  if ! command -v "${required}" >/dev/null 2>&1; then
    echo "Missing '${required}'. Run: sudo ./scripts/bootstrap-debian13.sh"
    exit 1
  fi
done

if [[ ! -f "${SERVICE_SOURCE}" ]]; then
  echo "Missing service file: ${SERVICE_SOURCE}"
  exit 1
fi

if [[ ! -f "${ENV_EXAMPLE_SOURCE}" ]]; then
  echo "Missing env example file: ${ENV_EXAMPLE_SOURCE}"
  exit 1
fi

if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${APP_GROUP}"
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_DIR}" --shell /usr/sbin/nologin -g "${APP_GROUP}" "${APP_USER}"
fi

if ! id -nG "${APP_USER}" | tr ' ' '\n' | grep -qx "${APP_GROUP}"; then
  usermod -g "${APP_GROUP}" "${APP_USER}"
fi

install -d -o "${APP_USER}" -g "${APP_GROUP}" "${APP_DIR}"

echo "[1/4] Syncing project to ${APP_DIR}..."
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.idea' \
  --exclude='.vscode' \
  --exclude='*.log' \
  "${ROOT_DIR}/" "${APP_DIR}/"

chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

echo "[2/4] Installing dependencies and building..."
su -s /bin/bash - "${APP_USER}" -c "cd \"${APP_DIR}\" && npm ci && npm run build && npm prune --omit=dev"

echo "[3/4] Installing systemd service..."
install -m 0644 "${SERVICE_SOURCE}" "/etc/systemd/system/${SERVICE_NAME}"

if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 0644 "${ENV_EXAMPLE_SOURCE}" "${ENV_FILE}"
  echo "Created ${ENV_FILE} from example. Review values before public exposure."
fi

echo "[4/4] Reloading and restarting service..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo
echo "Deployment done."
echo "Service status:"
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,20p'
echo
echo "Useful commands:"
echo "  journalctl -u ${SERVICE_NAME} -f"
echo "  systemctl restart ${SERVICE_NAME}"
