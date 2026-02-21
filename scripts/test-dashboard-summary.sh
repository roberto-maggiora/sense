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
# Validating Counts
# Logic Changes in Issue 14:
# - Offline takes precedence.
# - Seed Data:
#   1. Red (Active, Recent) -> Red
#   2. Amber (Active, Recent) -> Amber
#   3. Green (Active, Recent) -> Green
#   4. Offline (Active, Green, Old Data) -> Offline (Was Green before)
#   5. Grey (Active, Null Status, Recent) -> Not in buckets (Total 5)
# Expected:
# Total: 5
# Red: 1
# Amber: 1
# Green: 1 (Previously 2)
# Offline: 1

EXPECTED_TOTAL=5
EXPECTED_RED=1
EXPECTED_AMBER=1
EXPECTED_GREEN=1
EXPECTED_OFFLINE=1

echo -e "\n3. Validating Counts..."
FAIL=0

check_count() {
    local key=$1
    local expected=$2
    local actual=$(echo "$RESPONSE" | jq ".$key")
    if [ "$actual" != "$expected" ]; then
        echo "MISMATCH: $key - Expected: $expected, Got: $actual"
        FAIL=1
    fi
}

check_count "total_devices" $EXPECTED_TOTAL
check_count "red" $EXPECTED_RED
check_count "amber" $EXPECTED_AMBER
check_count "green" $EXPECTED_GREEN
check_count "offline" $EXPECTED_OFFLINE

if [ $FAIL -eq 0 ]; then
    echo "SUCCESS: All counts match expected values."
    # Verify Math: Total might be > sum(buckets) due to 'grey', but buckets must equal specified logic
    SUM=$((EXPECTED_RED + EXPECTED_AMBER + EXPECTED_GREEN + EXPECTED_OFFLINE))
    echo "Info: Bucket Sum = $SUM (Grey/Unknown devices accounting for gap of $((EXPECTED_TOTAL - SUM)))"
else
    echo "FAILURE: Counts mismatch."
    echo "Expected: Total=$EXPECTED_TOTAL Red=$EXPECTED_RED Amber=$EXPECTED_AMBER Green=$EXPECTED_GREEN Offline=$EXPECTED_OFFLINE"
    echo "Got:      $(echo "$RESPONSE" | jq -c '{total: .total_devices, red: .red, amber: .amber, green: .green, offline: .offline}')"
    exit 1
fi
