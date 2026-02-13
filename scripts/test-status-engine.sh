#!/bin/bash

API_ROOT="http://localhost:3000/api/v1"
CLIENT_ID="test-client"
DEVICE_EUI="24E124126B316D59" # test-device-1
INGEST_KEY="${INGEST_SHARED_KEY:-dev-secret}"

# Note: Ensure apps/api and apps/worker are running!

echo "0. Seeding Base Data..."
npx ts-node -r dotenv/config scripts/seed-milesight.ts

echo "1. Seeding Rule..."
npx ts-node -r dotenv/config scripts/seed-status.ts

# Generate BASE time (now, but fixed for the run)
BASE_MS=$(node -e 'console.log(Date.now())')
BASE_ISO=$(node -e "console.log(new Date($BASE_MS).toISOString())")

echo "--- Test Start at Base Time: $BASE_ISO ---"

# 2. Ingest Safe Point at T+0m (Green)
echo -e "\n2. Ingesting Safe Point (Temp=4) at T+0m..."
TIME=$(node -e "console.log(new Date($BASE_MS).toISOString())")

curl -v -X POST "$API_ROOT/ingest/milesight" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "'"$DEVICE_EUI"'",
    "temperature": 4,
    "time": "'"$TIME"'"
  }'

sleep 1

echo -e "Check Status (Expect Green)..."
curl -v -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/device-status"


# 3. Ingest Breach Point at T+1m (Amber)
echo -e "\n3. Ingesting Breach Point (Temp=10) at T+1m..."
TIME=$(node -e "console.log(new Date($BASE_MS + 60*1000).toISOString())")

curl -v -X POST "$API_ROOT/ingest/milesight" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "'"$DEVICE_EUI"'",
    "temperature": 10,
    "time": "'"$TIME"'"
  }'

sleep 1

echo -e "Check Status (Expect Amber)..."
curl -v -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/device-status"


# 4. Ingest Intermediate Points to maintain continuity (Gap < 15m)
echo -e "\n4. Ingesting Intermediate Points..."
for OFFSET in 10 20 30 40; do
  echo "   ...at T+${OFFSET}m"
  TIME=$(node -e "console.log(new Date($BASE_MS + $OFFSET*60*1000).toISOString())")
  
  curl -v -X POST "$API_ROOT/ingest/milesight" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Key: $INGEST_KEY" \
    -d '{
      "deviceEUI": "'"$DEVICE_EUI"'",
      "temperature": 10,
      "time": "'"$TIME"'"
    }'
  sleep 1
done


# 5. Ingest Final Breach Point at T+46m (Red)
# Duration will be 46m - 1m = 45m > 40m threshold
echo -e "\n5. Ingesting Final Breach Point (Temp=10) at T+46m..."
TIME=$(node -e "console.log(new Date($BASE_MS + 46*60*1000).toISOString())")

curl -v -X POST "$API_ROOT/ingest/milesight" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "'"$DEVICE_EUI"'",
    "temperature": 10,
    "time": "'"$TIME"'"
  }'

sleep 1

echo -e "Check Status (Expect Red)..."
curl -v -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/device-status"
