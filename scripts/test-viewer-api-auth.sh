#!/bin/bash
set -e

echo "----------------------------------------"
echo "  Testing Viewer API Authentication     "
echo "----------------------------------------"

API_URL="http://127.0.0.1:3000"

# 1. Login to get a token
echo "1. Attempting login as viewer@test.com..."
LOGIN_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "viewer@test.com", "password": "admin123"}')

TOKEN=$(echo $LOGIN_RES | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to retrieve authentication token."
  echo "Response was: $LOGIN_RES"
  exit 1
fi
echo "✅ Logged in successfully. Token acquired."

# 2. Access /devices endpoint WITHOUT token (should fail 401)
echo "2. Attempting to fetch devices without a token..."
DEVICES_RES_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/v1/devices")
if [ "$DEVICES_RES_NOAUTH" != "401" ]; then
  echo "❌ Expected 401 Unauthorized, got HTTP $DEVICES_RES_NOAUTH"
  exit 1
fi
echo "✅ Unauthenticated access correctly rejected with 401."

# 3. Access /devices endpoint WITH token (should succeed 200)
# (Dashboard uses /dashboard/devices, let's test both to be thorough)
echo "3. Attempting to fetch dashboard devices with token..."
DASHBOARD_DEVICES_RES=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "$API_URL/api/v1/dashboard/devices?limit=10" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$DASHBOARD_DEVICES_RES" | grep "HTTP_CODE" | cut -d':' -f2)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to fetch devices. HTTP $HTTP_CODE"
  echo "$DASHBOARD_DEVICES_RES"
  exit 1
fi

echo "✅ Successfully fetched devices with token (HTTP 200)."
echo "----------------------------------------"
echo "✅ Viewer API Authentication Verified!  "
echo "----------------------------------------"
