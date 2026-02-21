#!/bin/bash
# set -e

# Configuration
API_URL="http://localhost:3000"
CLIENT_ID="test-client"
EXTERNAL_ID="ack-snooze-test-eui-$(date +%s)" # Unique EUI
RULE_ID="test-ack-snooze-rule-$(date +%s)"
INGEST_KEY="dev-secret"

# Headers
H_CLIENT="X-Client-Id: $CLIENT_ID"
H_CONTENT="Content-Type: application/json"
H_INGEST="X-Ingest-Key: $INGEST_KEY"

echo "========================================================"
echo "TEST: Acknowledgement Snooze Logic"
echo "========================================================"

# 1. Setup Device
echo "[1/6] Creating Device (Milesight)..."
DEV_RESP=$(curl -s -X POST "$API_URL/api/v1/devices" -H "$H_CLIENT" -H "$H_CONTENT" \
  -d "{\"name\":\"Ack Snooze Device\", \"source\":\"milesight\", \"external_id\":\"$EXTERNAL_ID\"}")

# Parse ID
DEVICE_ID=$(echo "$DEV_RESP" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
  echo "FAIL: Could not create device. Response: $DEV_RESP"
  exit 1
fi
echo "PASS: Device created ($DEVICE_ID)"

# 2. Setup Rule
echo "[2/6] Setup Rule..."
# Fixed Route: /alert-rules
RULE_RESP=$(curl -s -X POST "$API_URL/api/v1/alert-rules" -H "$H_CLIENT" -H "$H_CONTENT" \
  -d "{\"scope_type\":\"device\", \"scope_id\":\"$DEVICE_ID\", \"parameter\":\"temperature\", \"operator\":\"gt\", \"threshold\":50, \"breach_duration_seconds\":1, \"repeat_interval_seconds\":2, \"max_gap_seconds\":600, \"recipients\":[\"test@example.com\"]}")

# Check if rule created (id in response)
if [[ "$RULE_RESP" != *"\"id\""* ]]; then
     echo "FAIL: Could not create rule. Response: $RULE_RESP"
     exit 1
fi
RULE_ID_CREATED=$(echo "$RULE_RESP" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)
echo "PASS: Rule created ($RULE_ID_CREATED)"

# 3. Trigger Breach (Ingest Milesight)
echo "[3/6] Triggering Red State (Ingest)..."
# Payload matches Milesight ingest requirements
INGEST_RESP=$(curl -s -X POST "$API_URL/api/v1/ingest/milesight" -H "$H_INGEST" -H "$H_CONTENT" \
  -d "{\"deviceEUI\":\"$EXTERNAL_ID\", \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"temperature\": 60}")

if [[ "$INGEST_RESP" != *"\"ok\":true"* ]]; then
  echo "FAIL: Ingest failed. Response: $INGEST_RESP"
  exit 1
fi
echo "PASS: Data ingested (Point 1)"

# Wait and Ingest Point 2 to satisfy duration > 1s
sleep 2
echo "[3.5/6] Triggering Red State (Ingest Point 2)..."
INGEST_RESP_2=$(curl -s -X POST "$API_URL/api/v1/ingest/milesight" -H "$H_INGEST" -H "$H_CONTENT" \
  -d "{\"deviceEUI\":\"$EXTERNAL_ID\", \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"temperature\": 62}")

if [[ "$INGEST_RESP_2" != *"\"ok\":true"* ]]; then
  echo "FAIL: Ingest 2 failed. Response: $INGEST_RESP_2"
  exit 1
fi
echo "PASS: Data ingested (Point 2)"

# 4. Wait & Check Initial
echo "[4/6] Waiting for worker (5s)..."
sleep 5

ALERTS=$(curl -s "$API_URL/api/v1/alerts/history?device_id=$DEVICE_ID&limit=5" -H "$H_CLIENT")
COUNT_1=$(echo "$ALERTS" | grep -o "\"id\"" | wc -l)

if [ "$COUNT_1" -lt "1" ]; then
  echo "FAIL: Expected at least 1 alert, found $COUNT_1. Response: $ALERTS"
  exit 1
fi
ALERT_ID=$(echo "$ALERTS" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)
echo "PASS: Initial alert generated ($ALERT_ID)"

# 5. Wait for Repeat (Trigger with new telemetry)
echo "[5/6] Triggering Repeat (Ingest Point 3)..."
sleep 2 # wait for interval
curl -s -X POST "$API_URL/api/v1/ingest/milesight" -H "$H_INGEST" -H "$H_CONTENT" \
  -d "{\"deviceEUI\":\"$EXTERNAL_ID\", \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"temperature\": 62}" > /dev/null

echo "[5/6] Waiting for worker (3s)..."
sleep 3

ALERTS_2=$(curl -s "$API_URL/api/v1/alerts/history?device_id=$DEVICE_ID&limit=5" -H "$H_CLIENT")
COUNT_2=$(echo "$ALERTS_2" | grep -o "\"id\"" | wc -l)
echo "Alerts count after repeat: $COUNT_2"

if [ "$COUNT_2" -le "$COUNT_1" ]; then
  echo "FAIL: Count did not increase ($COUNT_1 -> $COUNT_2). Repeat failed."
  exit 1
fi
echo "PASS: Repeat fired ($COUNT_2 alerts total)"

# 6. Acknowledge
echo "[6/6] Acknowledging alert $ALERT_ID..."
export ACK_RESP=$(curl -s -X POST "$API_URL/api/v1/alerts/$ALERT_ID/acknowledge" -H "$H_CLIENT" -H "$H_CONTENT" -d "{}") 

# 7. Check Snooze (Trigger with new telemetry)
echo "[7/7] Triggering next (should be Snoozed)..."
sleep 2
curl -s -X POST "$API_URL/api/v1/ingest/milesight" -H "$H_INGEST" -H "$H_CONTENT" \
  -d "{\"deviceEUI\":\"$EXTERNAL_ID\", \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"temperature\": 62}" > /dev/null

echo "[7/7] Waiting for worker (3s)..."
sleep 3

ALERTS_3=$(curl -s "$API_URL/api/v1/alerts/history?device_id=$DEVICE_ID&limit=5" -H "$H_CLIENT")
COUNT_3=$(echo "$ALERTS_3" | grep -o "\"id\"" | wc -l)
echo "Alerts count after snooze trigger: $COUNT_3"

if [ "$COUNT_3" -gt "$COUNT_2" ]; then
  echo "FAIL: Alert count increased ($COUNT_2 -> $COUNT_3)! Snooze failed."
  exit 1
else
  echo "PASS: Alert count stable ($COUNT_2 -> $COUNT_3)"
fi

# 8. Check Resume
echo "[8/8] Triggering subsequent (should Resume)..."
sleep 2
curl -s -X POST "$API_URL/api/v1/ingest/milesight" -H "$H_INGEST" -H "$H_CONTENT" \
  -d "{\"deviceEUI\":\"$EXTERNAL_ID\", \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"temperature\": 62}" > /dev/null

echo "[8/8] Waiting for worker (3s)..."
sleep 3

ALERTS_4=$(curl -s "$API_URL/api/v1/alerts/history?device_id=$DEVICE_ID&limit=5" -H "$H_CLIENT")
COUNT_4=$(echo "$ALERTS_4" | grep -o "\"id\"" | wc -l)
echo "Alerts count after resume trigger: $COUNT_4"

if [ "$COUNT_4" -le "$COUNT_3" ]; then
  echo "FAIL: Alert count did not increase after snooze used up."
  cat /tmp/worker-debug.log
  exit 1
fi
echo "SUCCESS: Acknowledgement snooze test passed!"

