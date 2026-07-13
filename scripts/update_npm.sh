#!/usr/bin/env bash
set -euo pipefail

APPS=(BotTester CalendarAI Mik3Bot WebAgent knowbase promptbase sharebasePro)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for app in "${APPS[@]}"; do
  dir="$ROOT/$app"
  if [ ! -f "$dir/package.json" ]; then
    echo "⚠  $app — no package.json, skipping"
    continue
  fi

  echo ""
  echo "── $app ─────────────────────────────────────"
  cd "$dir"

  echo "  bumping versions..."
  npx --yes npm-check-updates -u --silent

  echo "  installing..."
  npm install --silent

  echo "  auditing..."
  npm audit fix --silent || true

  echo "  done."

  snyk test || true
done

echo ""
echo "All apps updated."
