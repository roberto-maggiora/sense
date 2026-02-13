#!/bin/bash
API_ROOT="http://localhost:3000/api/v1"
CLIENT_ID="test-client"
DEVICE_ID="test-device-1"

echo "1. GET /latest (Valid)"
curl -s -H "X-Client-Id: $CLIENT_ID" \
  "$API_ROOT/devices/$DEVICE_ID/latest" | jq .

echo -e "\n2. GET /telemetry (Valid, limit=2)"
curl -s -H "X-Client-Id: $CLIENT_ID" \
  "$API_ROOT/devices/$DEVICE_ID/telemetry?limit=2" | jq .

echo -e "\n3. GET /latest (Invalid Client)"
curl -s -v -H "X-Client-Id: wrong-client" \
  "$API_ROOT/devices/$DEVICE_ID/latest" 2>&1 | grep "HTTP/"

echo -e "\n4. GET /latest (Invalid Device)"
curl -s -v -H "X-Client-Id: $CLIENT_ID" \
  "$API_ROOT/devices/wrong-device/latest" 2>&1 | grep "HTTP/"
