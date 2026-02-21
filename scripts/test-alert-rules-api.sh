#!/bin/sh
set -e

API_URL="http://localhost:3000"
VIEWER_EMAIL="viewer@test.com"
CLIENT_ADMIN_EMAIL="clientadmin@test.com"
PASSWORD="admin123"

echo "======================================"
echo "Testing Device Alert Rules Roles check"
echo "======================================"

echo "1. Logging in as CLIENT_ADMIN..."
ADMIN_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$CLIENT_ADMIN_EMAIL"'","password":"'"$PASSWORD"'"}')
ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$ADMIN_TOKEN" ]; then
    echo "❌ Failed to get Client Admin token"
    exit 1
fi

echo "2. Finding a device ID..."
DEVICES_RES=$(curl -s -X GET "$API_URL/api/v1/dashboard/devices" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
DEVICE_ID=$(echo "$DEVICES_RES" | grep -o '"id":"[^"]*' | head -n 1 | grep -o '[^"]*$')

if [ -z "$DEVICE_ID" ]; then
    echo "❌ No devices found for client"
    exit 1
fi
echo "✅ Testing on device $DEVICE_ID"

echo "3. Creating an Alert Rule (CLIENT_ADMIN)..."
CREATE_RES=$(curl -s -X POST "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metric":"temperature","operator":"gt","threshold":35,"duration_seconds":300,"severity":"amber","enabled":true}')
RULE_ID=$(echo "$CREATE_RES" | grep -o '"id":"[^"]*' | head -n 1 | grep -o '[^"]*$')

if [ -z "$RULE_ID" ]; then
    echo "❌ Failed to create rule: $CREATE_RES"
    exit 1
fi
echo "✅ Rule created: $RULE_ID"

echo "4. Checking Viewer cannot Delete Rule..."
VIEWER_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$VIEWER_EMAIL"'","password":"'"$PASSWORD"'"}')
VIEWER_TOKEN=$(echo "$VIEWER_RES" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

DELETE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/v1/rules/$RULE_ID" \
  -H "Authorization: Bearer $VIEWER_TOKEN")

if [ "$DELETE_CHECK" != "403" ]; then
    echo "❌ Viewer bypassing role expectations, received HTTP $DELETE_CHECK"
    exit 1
fi
echo "✅ VIEWER blocked from deleting rule (HTTP 403)"

echo "5. Cleaning up (CLIENT_ADMIN deletes Rule)..."
DELETE_RES=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/v1/rules/$RULE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$DELETE_RES" != "204" ] && [ "$DELETE_RES" != "200" ]; then
    echo "❌ Final deletion failed HTTP $DELETE_RES"
    exit 1
fi
echo "✅ Rule cleaned up successfully"

echo "All Alert Rules Role tests passed!"
exit 0
