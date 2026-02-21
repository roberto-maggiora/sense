#!/bin/sh

# Make script exit on first failure
set -e

# Base URL for local Docker environment
API_URL="http://localhost:3000"

echo "----------------------------------------"
echo "  Testing Device Rules API Endpoints  "
echo "----------------------------------------"

# 1. Login with CLIENT_ADMIN credentials
echo "1. Attempting Login with CLIENT_ADMIN credentials..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"clientadmin@test.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to retrieve auth token. Login response: $LOGIN_RESPONSE"
    exit 1
fi
echo "✅ Login successful. Token obtained."

# 2. Get a valid device ID from the /api/v1/devices endpoint
echo "2. Fetching a device..."
DEVICES_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/devices" \
    -H "Authorization: Bearer $TOKEN")

DEVICE_ID=$(echo "$DEVICES_RESPONSE" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
    echo "❌ No devices found for this client. Cannot test rules without a device."
    exit 1
fi
echo "✅ Found device: $DEVICE_ID"

# 3. Create a new Rule for the device
echo "3. Creating a new Alarm Rule..."
CREATE_RULE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
    -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "metric": "temperature",
        "operator": "gt",
        "threshold": 30,
        "duration_seconds": 60,
        "severity": "amber",
        "enabled": true
    }')

HTTP_CODE=$(echo "$CREATE_RULE_RESPONSE" | tail -n1)
BODY=$(echo "$CREATE_RULE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "201" ]; then
    # Could be 409 if a rule already exists, let's treat it gracefully for idempotent test runs
    if [ "$HTTP_CODE" = "409" ]; then
        echo "⚠️ Rule already existed, fetching existing rules instead."
    else
        echo "❌ Rule creation failed with HTTP $HTTP_CODE"
        echo "Response: $BODY"
        exit 1
    fi
else
    echo "✅ Rule created successfully."
fi

# 4. List Rules for the device
echo "4. Listing rules for the device..."
RULES_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
    -H "Authorization: Bearer $TOKEN")

RULE_ID=$(echo "$RULES_RESPONSE" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)

if [ -z "$RULE_ID" ]; then
    echo "❌ Failed to fetch rules or no rules exist for device: $DEVICE_ID"
    exit 1
fi
echo "✅ Listed rules successfully. Rule ID to test: $RULE_ID"

# 5. Patch the Rule
echo "5. Updating the rule threshold..."
PATCH_RESPONSE=$(curl -s -X PATCH "$API_URL/api/v1/rules/$RULE_ID" \
    -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "threshold": 35,
        "duration_seconds": 120
    }')

HTTP_CODE=$(echo "$PATCH_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Rule patch failed with HTTP $HTTP_CODE"
    echo "Response: $(echo "$PATCH_RESPONSE" | sed '$d')"
    exit 1
fi
echo "✅ Rule updated successfully."

# 6. Negative Test: Attempt creating invalid metric
echo "6. Testing input validation (invalid metric)..."
INVALID_CREATE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/devices/$DEVICE_ID/rules" \
    -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "metric": "humidity",
        "operator": "gt",
        "threshold": 60,
        "duration_seconds": 0,
        "severity": "red",
        "enabled": true
    }')

HTTP_CODE=$(echo "$INVALID_CREATE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "400" ]; then
    echo "❌ Expected HTTP 400 for invalid metric, got $HTTP_CODE"
    exit 1
fi
echo "✅ Input validation correctly rejected invalid metric."

# 7. Delete the rule
echo "7. Deleting the rule..."
DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/v1/rules/$RULE_ID" \
    -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "204" ]; then
    echo "❌ Rule deletion failed with HTTP $HTTP_CODE"
    echo "Response: $(echo "$DELETE_RESPONSE" | sed '$d')"
    exit 1
fi
echo "✅ Rule deleted successfully."

echo "----------------------------------------"
echo "✅ All Alarm Rules API endpoints verified!"
echo "----------------------------------------"
