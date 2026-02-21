#!/bin/sh

# Make script exit on first failure
set -e

# Base URL for local Docker environment
API_URL="http://localhost:3000"

echo "----------------------------------------"
echo "  Testing Worker Alarm Evaluation Engine  "
echo "----------------------------------------"

# 1. Login with CLIENT_ADMIN credentials
echo "1. Attempting Login with CLIENT_ADMIN credentials..."

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"clientadmin@test.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to retrieve auth token."
    exit 1
fi

# 2. Get a valid device ID from the /api/v1/devices endpoint
echo "2. Fetching a device..."
DEVICES_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/devices" \
    -H "Authorization: Bearer $TOKEN")

DEVICE_ID=$(echo "$DEVICES_RESPONSE" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
    echo "❌ No devices found for this client."
    exit 1
fi
echo "✅ Using device: $DEVICE_ID"

# 2.5 Ensure the device has a known external_id for milesight ingestion
echo "2.5 Setting test device external_id..."
docker compose exec postgres psql -U sense -d sense -c "UPDATE devices SET external_id='TEST-MAC-001' WHERE id='$DEVICE_ID';"

# 3. Ensure no dangling test rules
echo "3. Cleaning up old test rules..."
RULES_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/devices/$DEVICE_ID/rules" -H "Authorization: Bearer $TOKEN")

# Simple json parsing to get all rule IDs (jq would be better but keeping dependencies low)
OLD_RULE_IDS=$(echo "$RULES_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

for id in $OLD_RULE_IDS; do
    curl -s -X DELETE "$API_URL/api/v1/rules/$id" -H "Authorization: Bearer $TOKEN" > /dev/null
done

# 4. Create an Alarm Rule (Temperature > 30 for 0 duration / immediate)
echo "4. Creating a test Alarm Rule..."
CREATE_RULE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
    -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "metric": "temperature",
        "operator": "gt",
        "threshold": 30,
        "duration_seconds": 0,
        "severity": "red",
        "enabled": true
    }')

HTTP_CODE=$(echo "$CREATE_RULE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ Rule creation failed with HTTP $HTTP_CODE"
    exit 1
fi
RULE_ID=$(echo "$CREATE_RULE_RESPONSE" | sed '$d' | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "✅ Rule created. ID: $RULE_ID"

# 5. Ingest Telemetry Triggering the rule (Temperature = 35)
echo "5. Sending telemetry payload to trigger rule..."
INGEST_CLIENT_SECRET="dev-secret"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
JOB_ID=$RANDOM

curl -w "\nHTTP_CODE:%{http_code}\n" -X POST "$API_URL/api/v1/ingest/milesight" \
    -H "X-Ingest-Key: $INGEST_CLIENT_SECRET" \
    -H "Content-Type: application/json" \
    -d '{
        "deviceEUI": "TEST-MAC-001",
        "temperature": 35,
        "humidity": 50,
        "time": "'"$NOW_ISO"'"
    }'
echo "✅ Telemetry queued."

# 6. Run Worker to process the payload and evaluate rules
echo "6. Waiting for worker to process telemetry..."
sleep 5

# 7. Check NotificationOutbox for active trigger (resolved_at = null)
echo "7. Verifying NotificationOutbox active status..."
# Access db through api container which has prisma client
ACTIVE_COUNT=$(docker compose exec api sh -c 'npx prisma studio' > /dev/null 2>&1 || true)
# A better way is to query DB directly via docker or expose a temp api. Using prisma raw query
DB_RAW_RES=$(docker compose exec postgres psql -U sense -d sense -t -c "SELECT count(*) FROM notifications_outbox WHERE device_id='$DEVICE_ID' AND rule_id='$RULE_ID' AND resolved_at IS NULL;")
ACTIVE_ALARM_COUNT=$(echo $DB_RAW_RES | xargs)

if [ "$ACTIVE_ALARM_COUNT" != "1" ]; then
    echo "❌ Expected 1 active alarm in outbox, found $ACTIVE_ALARM_COUNT"
    docker compose exec postgres psql -U sense -d sense -c "SELECT * FROM notifications_outbox WHERE device_id='$DEVICE_ID' AND rule_id='$RULE_ID';"
    exit 1
fi
echo "✅ Alarm is ACTIVE."

# 8. Ingest Telemetry Resolving the rule (Temperature = 25)
echo "8. Sending telemetry payload to resolve rule..."
NOW_ISO_2=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

curl -w "\nHTTP_CODE:%{http_code}\n" -X POST "$API_URL/api/v1/ingest/milesight" \
    -H "X-Ingest-Key: $INGEST_CLIENT_SECRET" \
    -H "Content-Type: application/json" \
    -d '{
        "deviceEUI": "TEST-MAC-001",
        "temperature": 25,
        "humidity": 50,
        "time": "'"$NOW_ISO_2"'"
    }'

echo "9. Waiting for worker to process resolution..."
sleep 5

# 10. Check NotificationOutbox for resolved trigger (resolved_at NOT NULL)
echo "10. Verifying NotificationOutbox resolved status..."
DB_RAW_RES_RESOLVED=$(docker compose exec postgres psql -U sense -d sense -t -c "SELECT count(*) FROM notifications_outbox WHERE device_id='$DEVICE_ID' AND rule_id='$RULE_ID' AND resolved_at IS NOT NULL;")
RESOLVED_ALARM_COUNT=$(echo $DB_RAW_RES_RESOLVED | xargs)

if [ "$RESOLVED_ALARM_COUNT" != "1" ]; then
    echo "❌ Expected 1 resolved alarm in outbox, found $RESOLVED_ALARM_COUNT"
    exit 1
fi
echo "✅ Alarm is RESOLVED."

# Cleanup
echo "11. Cleaning up..."
curl -s -X DELETE "$API_URL/api/v1/rules/$RULE_ID" -H "Authorization: Bearer $TOKEN" > /dev/null

echo "----------------------------------------"
echo "✅ Worker Evaluation Engine fully verified!"
echo "----------------------------------------"
