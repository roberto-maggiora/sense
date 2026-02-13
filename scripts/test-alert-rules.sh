#!/bin/bash
API_ROOT="http://localhost:3000/api/v1"
CLIENT_ID="test-client"
# We need a valid device ID from previous steps or seed
DEVICE_ID="test-device-1"

echo "1. Create Rule (Valid)"
CREATE_RES=$(curl -s -X POST "$API_ROOT/alert-rules" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: $CLIENT_ID" \
  -d '{
    "scope_type": "device",
    "scope_id": "'"$DEVICE_ID"'",
    "parameter": "temperature",
    "operator": "gt",
    "threshold": 30,
    "breach_duration_seconds": 600
  }')
echo "$CREATE_RES" | jq .

RULE_ID=$(echo "$CREATE_RES" | jq -r .id)

if [ "$RULE_ID" == "null" ]; then
  echo "Failed to create rule"
  exit 1
fi

echo -e "\n2. List Rules"
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/alert-rules" | jq .

echo -e "\n3. Get Rule Details"
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/alert-rules/$RULE_ID" | jq .

echo -e "\n4. Update Rule (Valid)"
curl -s -X PATCH "$API_ROOT/alert-rules/$RULE_ID" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: $CLIENT_ID" \
  -d '{ "threshold": 35, "enabled": false }' | jq .

echo -e "\n5. Create Rule (Invalid Logic: max_gap < expected)"
curl -s -X POST "$API_ROOT/alert-rules" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: $CLIENT_ID" \
  -d '{
    "scope_type": "device",
    "scope_id": "'"$DEVICE_ID"'",
    "parameter": "humidity",
    "operator": "lt",
    "threshold": 30,
    "breach_duration_seconds": 600,
    "expected_sample_seconds": 600,
    "max_gap_seconds": 300
  }' | jq .

echo -e "\n6. Delete Rule"
curl -s -X DELETE -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/alert-rules/$RULE_ID"
echo "Deleted (204 if empty)"

echo -e "\n7. Get Deleted Rule (Should be 404)"
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/alert-rules/$RULE_ID" | jq .
