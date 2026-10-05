#!/usr/bin/env bash
# Restarts the five harness servers (normal, rest-shape, unconfigured, 429, 400). Logs under shots/logs.
cd "$(dirname "$0")"
mkdir -p shots/logs
if [ -f shots/logs/pids ]; then kill $(cat shots/logs/pids) 2>/dev/null; fi
for p in 4173 4174 4175 4176 4177 4178 4179; do fuser -k "$p/tcp" >/dev/null 2>&1; done
sleep 0.5
: > shots/logs/pids
start() { "$@" & echo $! >> shots/logs/pids; }
start env node server.mjs > shots/logs/4173.log 2>&1
start env PORT=4174 MOCK_SHAPE=rest node server.mjs > shots/logs/4174.log 2>&1
start env PORT=4175 MOCK_UNCONFIGURED=1 node server.mjs > shots/logs/4175.log 2>&1
start env PORT=4176 MOCK_PROVIDER_429=1 node server.mjs > shots/logs/4176.log 2>&1
start env PORT=4177 MOCK_PROVIDER_400=1 node server.mjs > shots/logs/4177.log 2>&1
start env PORT=4178 MOCK_PROVIDER_503=1 node server.mjs > shots/logs/4178.log 2>&1
start env PORT=4179 MOCK_SLOW_MS=9000 node server.mjs > shots/logs/4179.log 2>&1
sleep 2
for p in 4173 4174 4175 4176 4177 4178 4179; do curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:$p/api/health; done
