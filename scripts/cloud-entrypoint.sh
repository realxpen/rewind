#!/bin/sh
set -eu

forward() {
  external_port="$1"
  internal_port="$2"
  socat "TCP-LISTEN:${external_port},fork,reuseaddr,bind=0.0.0.0" "TCP:127.0.0.1:${internal_port}" &
}

nginx
forward 8081 "${RING_WEBHOOK_PORT:-3003}"
forward 8082 "${REWIND_MCP_PORT:-3004}"
forward 8083 "${REWIND_ALEXA_PORT:-3005}"

exec node dist/packages/ring/scripts/live-preview.js
