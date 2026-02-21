#!/bin/bash
# set -e

# Configuration
API_URL="http://localhost:3000"
CLIENT_ID="test-client"
EXTERNAL_ID="disabled-test-eui-$(date +%s)"

# Headers
H_CLIENT="X-Client-Id: $CLIENT_ID"
H_CONTENT="Content-Type: application/json"

echo "========================================================"
echo "TEST: Exclude Disabled Devices"
echo "========================================================"

# 1. Create Device
echo "[1/3] Creating Device..."
DEV_RESP=$(curl -s -X POST "$API_URL/api/v1/devices" -H "$H_CLIENT" -H "$H_CONTENT" \
  -d "{\"name\":\"Disabled Test Device\", \"source\":\"milesight\", \"external_id\":\"$EXTERNAL_ID\"}")

DEVICE_ID=$(echo "$DEV_RESP" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
  echo "FAIL: Could not create device. Response: $DEV_RESP"
  exit 1
fi
echo "PASS: Device created ($DEVICE_ID)"

# 2. Disable Device
echo "[2/3] Disabling Device..."
# Using DELETE to disable (soft delete) based on previous context/standard pattern
DEL_RESP=$(curl -s -X DELETE "$API_URL/api/v1/devices/$DEVICE_ID" -H "$H_CLIENT")
# Expect 204 or success
# Check if we get an error
if [[ "$DEL_RESP" == *"error"* ]]; then
     echo "FAIL: Could not disable device. Response: $DEL_RESP"
     exit 1
fi
echo "PASS: Device disabled"

# 3. List Devices and Verify Exclusion
echo "[3/3] Listing Devices..."
LIST_RESP=$(curl -s "$API_URL/api/v1/devices?limit=200" -H "$H_CLIENT")

# Check if DEVICE_ID is in the response
if echo "$LIST_RESP" | grep -q "$DEVICE_ID"; then
  echo "FAIL: Disabled device $DEVICE_ID found in response!"
  echo "Response snippet: $(echo "$LIST_RESP" | grep -o "$DEVICE_ID")"
  exit 1
else
  echo "PASS: Disabled device not found in response."
fi

echo "SUCCESS: Disabled devices excluded."
