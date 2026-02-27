#!/bin/sh
set -e

mkdir -p /app/data

exec node server.js
