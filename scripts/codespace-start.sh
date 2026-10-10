#!/usr/bin/env bash
set -euo pipefail
if curl -fsS http://127.0.0.1:3001/api/session >/dev/null 2>&1; then
  exit 0
fi
nohup npm start >/tmp/second-opinion.log 2>&1 &
echo 'Second Opinion is starting. Open private port 3001 in the Ports panel.'
