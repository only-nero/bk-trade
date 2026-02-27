#!/bin/sh
set -e

mkdir -p /app/data
chmod 0777 /app/data || true
[ -f "$DB_FILE" ] || touch "$DB_FILE"
chmod 0666 "$DB_FILE" || true

exec node server.js
