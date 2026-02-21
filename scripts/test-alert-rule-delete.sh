#!/bin/bash
set -e

API_URL="http://127.0.0.1:3000"
CLIENT_ADMIN_EMAIL="clientadmin@test.com"
PASSWORD="admin123"

echo "======================================"
echo "Testing Device Alert Rule Deletion"
echo "======================================"

echo "1. Logging in as CLIENT_ADMIN..."
ADMIN_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$CLIENT_ADMIN_EMAIL"'","password":"'"$PASSWORD"'"}')
ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
    echo "❌ Failed to login."
    exit 1
fi
echo "✅ Logged in successfully"

echo "2. Finding a device ID..."
DEVICES_RES=$(curl -s -X GET "$API_URL/api/v1/dashboard/devices" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
DEVICE_ID=$(echo "$DEVICES_RES" | grep -o '"id":"[^"]*' | head -1 | grep -o '[^"]*$')

if [ -z "$DEVICE_ID" ]; then
    echo "❌ No device found to test with."
    exit 1
fi
echo "✅ Testing on device $DEVICE_ID"

echo "3. Cleaning existing rules first..."
RULES_JSON=$(curl -s -X GET "$API_URL/api/v1/devices/$DEVICE_ID/rules" -H "Authorization: Bearer $ADMIN_TOKEN")
for id in $(echo "$RULES_JSON" | grep -o '"id":"[^"]*' | grep -o '[^"]*$'); do
    curl -s -X DELETE "$API_URL/api/v1/rules/$id" -H "Authorization: Bearer $ADMIN_TOKEN"
done

echo "4. Creating a test Alert Rule..."
CREATE_RES=$(curl -s -X POST "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"metric":"temperature","operator":"gt","threshold":110,"duration_seconds":300,"severity":"amber","enabled":true}')

RULE_ID=$(echo "$CREATE_RES" | grep -o '"id":"[^"]*' | head -n 1 | grep -o '[^"]*$')

if [ -z "$RULE_ID" ]; then
    echo "❌ Failed to create rule."
    echo "$CREATE_RES"
    exit 1
fi

echo "✅ Rule created: $RULE_ID"

echo "5. Deleting the rule (without Content-Type)..."
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/v1/rules/$RULE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$DELETE_STATUS" != "204" ]; then
    echo "❌ Fastify failed to delete rule. HTTP $DELETE_STATUS expected 204"
    exit 1
fi
echo "✅ Rule deleted successfully (HTTP 204)"

echo "6. Verifying rule is gone..."
RULES_RES=$(curl -s -X GET "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$RULES_RES" | grep -q "$RULE_ID"; then
    echo "❌ Rule $RULE_ID still exists in the GET response!"
    exit 1
fi

echo "✅ Rule verification passed (not found in list)"
echo "🎉 Delete flow works perfectly!"
exit 0
