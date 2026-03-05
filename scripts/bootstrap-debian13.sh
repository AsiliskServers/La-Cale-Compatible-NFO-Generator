#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/bootstrap-debian13.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[1/4] Installing base packages..."
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release

has_node_22=0
if command -v node >/dev/null 2>&1; then
  if node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
    has_node_22=1
  fi
fi

if [[ "${has_node_22}" -eq 0 ]]; then
  echo "[2/4] Installing Node.js 22.x from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
else
  echo "[2/4] Node.js >= 22 already present, skipping NodeSource setup."
fi

echo "[3/4] Installing runtime/build dependencies..."
apt-get install -y --no-install-recommends nodejs mediainfo git rsync build-essential

echo "[4/4] Cleaning apt cache..."
apt-get autoremove -y
apt-get clean

echo
echo "Installed versions:"
node --version || true
npm --version || true
mediainfo --Version || true
