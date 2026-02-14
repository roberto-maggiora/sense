#!/bin/bash
API_ROOT="http://localhost:3000/api/v1/dashboard"
CLIENT_ID="test-client"

echo "1. Seeding Dashboard Data (Reusing existing seed)..."
npx ts-node -r dotenv/config scripts/seed-dashboard.ts

echo -e "\n2. Testing Metric Extraction (Expecting 'value' or 'temperature')..."
# Note: Seed data sets 'value', but also 'metrics' for ingestion. 
# Our new mapper extracts 'temperature'/'humidity' from top level payload if present.
# The `seed-dashboard.ts` sets `payload: { value: X }`.
# To verify metrics, we should modify seed or just accept nulls for now and verify structure.
# Let's verify structure:
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/devices?limit=1" | jq -c '.data[0].metrics'

echo -e "\n3. Testing Offline Filter..."
# Expects 'Offline Device' (Green status, old data) and 'Grey Device' (if no data? No, Grey has data but no status).
# Offline filter: occurrred_at < 30m OR null
# Seed:
# - Offline Device: data 60m ago
# - Grey Device: data just now (online, just no status)
# So 'status=offline' should return ONLY 'Offline Device'? 
# Wait, 'Red', 'Amber', 'Green' (online) have recent data.
# 'Offline Device' has old data.
# 'Grey Device' has recent data.
# So result should be 1 device: 'Offline Device'.
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/devices?status=offline" | jq -c '.data[] | {name: .name, last_seen: .latest_telemetry.occurred_at}'
