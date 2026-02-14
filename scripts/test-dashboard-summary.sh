#!/bin/bash
API_ROOT="http://localhost:3000/api/v1/dashboard"
CLIENT_ID="test-client"

echo "1. Seeding Dashboard Data (Includes 1 Offline Green device)..."
npx ts-node -r dotenv/config scripts/seed-dashboard.ts

echo -e "\n2. Fetching Dashboard Summary..."
RESPONSE=$(curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/summary")
echo "$RESPONSE" | jq .

# Validation Logic
# Seeded: 
# 1. Red (Active, Online)
# 2. Amber (Active, Online)
# 3. Green (Active, Online)
# 4. Green (Active, Offline - old data)
# 5. Grey (Active, Online)
# Total active: 5

# Status Counts:
# Red: 1
# Amber: 1
# Green: 2 (Both device 3 and 4 have 'green' status in DB)
# Offline: 1 (Device 4 has old telemetry)

# Assertions
echo -e "\n3. Validating Counts..."
EXPECTED_TOTAL=5
EXPECTED_RED=1
EXPECTED_AMBER=1
EXPECTED_GREEN=2
EXPECTED_OFFLINE=1

JSON_TOTAL=$(echo "$RESPONSE" | jq '.total_devices')
JSON_RED=$(echo "$RESPONSE" | jq '.red')
JSON_AMBER=$(echo "$RESPONSE" | jq '.amber')
JSON_GREEN=$(echo "$RESPONSE" | jq '.green')
JSON_OFFLINE=$(echo "$RESPONSE" | jq '.offline')

if [ "$JSON_TOTAL" -eq "$EXPECTED_TOTAL" ] && \
   [ "$JSON_RED" -eq "$EXPECTED_RED" ] && \
   [ "$JSON_AMBER" -eq "$EXPECTED_AMBER" ] && \
   [ "$JSON_GREEN" -eq "$EXPECTED_GREEN" ] && \
   [ "$JSON_OFFLINE" -eq "$EXPECTED_OFFLINE" ]; then
   echo "SUCCESS: All counts match expected values."
   exit 0
else
   echo "FAILURE: Counts mismatch."
   echo "Expected: Total=$EXPECTED_TOTAL Red=$EXPECTED_RED Amber=$EXPECTED_AMBER Green=$EXPECTED_GREEN Offline=$EXPECTED_OFFLINE"
   echo "Got:      Total=$JSON_TOTAL Red=$JSON_RED Amber=$JSON_AMBER Green=$JSON_GREEN Offline=$JSON_OFFLINE"
   exit 1
fi
