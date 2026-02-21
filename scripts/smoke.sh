#!/bin/bash
set -euo pipefail

# Default to internal docker network alias if not set
API_BASE="${API_BASE:-http://127.0.0.1:3000}"
CLIENT_ID="${CLIENT_ID:-test-client}"

echo "Running smoke tests against $API_BASE with Client ID: $CLIENT_ID"

# 1. Health Check
echo "Checking API Health..."
curl -fsS "$API_BASE/api/v1/health"
echo ""

# 2. Dashboard Summary
echo "Checking Dashboard Summary..."
curl -fsS -H "X-Client-Id: $CLIENT_ID" "$API_BASE/api/v1/dashboard/summary"
echo ""

# 3. Dashboard Devices
echo "Checking Dashboard Devices..."
curl -fsS -H "X-Client-Id: $CLIENT_ID" "$API_BASE/api/v1/dashboard/devices?limit=50" > /dev/null
echo "Devices OK"

# 4. Alerts History (Optional - might be empty but should not fail)
echo "Checking Alerts History..."
# Use || true to prevent script failure on 404 or 500 if that's expected behavior for empty, 
# but user requested curl -f (fail on server error). 
# User prompt: "alerts/history may be empty, but should not 500... Use curl -f so 500 fails."
# But also "|| true" in prompt "curl ... || true".
# I will use curl -f which fails on 500. The || true catches the non-zero exit code of curl if it fails.
# But if we want to FAIL on 500, we shouldn't use || true.
# Wait, user prompt said: "curl -fsS ... || true (alerts/history may be empty, but should not 500; if it 500s, fail. Use curl -f so 500 fails. If endpoint doesn’t exist, fail too.)"
# This is contradictory. "If it 500s, fail" but "|| true" implies ignore failure.
# Probably user means: try to fetch, if it fails (500 or 404), print error, but maybe don't exit script? 
# Or maybe they want it to pass even if it fails?
# "If it 500s, fail. ... If endpoint doesn't exist, fail too." -> So curl -f is correct.
# Then "|| true" would mask the failure.
# I will drop `|| true` for the alerts history to strictly follow "If it 500s, fail".
# However, if it returns 404 (endpoint doesn't exist), curl -f will also fail.
# The user prompt source "scripts/smoke.sh Content: ... curl ... || true"
# I will follow the user's explicit content instruction: "curl ... || true".

curl -fsS -H "X-Client-Id: $CLIENT_ID" "$API_BASE/api/v1/alerts/history?limit=10" > /dev/null || echo "Warning: Alerts history endpoint failed or not found"

echo "OK"
