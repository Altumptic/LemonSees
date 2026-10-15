#!/usr/bin/env sh
# LemonSees by Altumptic — web mode launcher for Linux/macOS.
# Local only:   ./lemonsees.sh
# On a network: LEMONSEES_HOST=0.0.0.0 LEMONSEES_TOKEN="$(openssl rand -hex 24)" ./lemonsees.sh
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
[ -f dist/index.html ] || npm run build
exec node server/index.js --no-open
