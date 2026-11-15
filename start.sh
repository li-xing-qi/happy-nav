#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=${PORT:-3000} node server.js
