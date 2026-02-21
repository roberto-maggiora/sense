#!/bin/bash
set -e

API_URL="http://localhost:3000/api/v1"
ADMIN_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000/auth/login"
EMAIL="admin@sense.local"
PASSWORD="admin123"

# 1. Login
echo "1. Attempting login as $EMAIL..."
LOGIN_RES=$(curl -s -X POST "$AUTH_URL" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RES | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to retrieve authentication token."
  echo "Response was: $LOGIN_RES"
  exit 1
fi
echo "✅ Logged in successfully. Token acquired."

# 2. Get the test-client ID to impersonate
echo "2. Fetching Clients list (No impersonation needed here)..."
CLIENTS_RES=$(curl -s -X GET "$ADMIN_URL/admin/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-admin-token: test-admin-token")

CLIENT_ID=$(echo $CLIENTS_RES | grep -o 'test-client"[^}]*"id":"[^"]*' | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1)

if [ -z "$CLIENT_ID" ]; then
  # Fallback JSON parsing if the string format is slightly different
  CLIENT_ID=$(echo $CLIENTS_RES | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -n 1)
fi

if [ -z "$CLIENT_ID" ]; then
  echo "❌ Failed to find a valid client in the platform to impersonate."
  echo "$CLIENTS_RES"
  exit 1
fi
echo "✅ Identified target impersonation Client: $CLIENT_ID"

# 3. Attempt Dashboard fetch WITHOUT Impersonation Header
echo "3. Fetching /dashboard/summary without X-Client-Id..."
NO_HEADER_RES=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "$API_URL/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE_NO_HEADER=$(echo "$NO_HEADER_RES" | grep "HTTP_CODE" | cut -d':' -f2)

if [ "$HTTP_CODE_NO_HEADER" != "409" ]; then
  echo "❌ Expected HTTP 409 Conflict, got $HTTP_CODE_NO_HEADER"
  echo "$NO_HEADER_RES"
  exit 1
fi
echo "✅ Explicit 409 rejection correctly blocked the un-scoped request."

# 4. Attempt Dashboard fetch WITH Impersonation Header
echo "4. Fetching /dashboard/summary WITH X-Client-Id: $CLIENT_ID..."
WITH_HEADER_RES=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "$API_URL/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Client-Id: $CLIENT_ID")

HTTP_CODE_WITH_HEADER=$(echo "$WITH_HEADER_RES" | grep "HTTP_CODE" | cut -d':' -f2)

if [ "$HTTP_CODE_WITH_HEADER" != "200" ]; then
  echo "❌ Expected HTTP 200 OK after successful impersonation, got $HTTP_CODE_WITH_HEADER"
  echo "$WITH_HEADER_RES"
  exit 1
fi
echo "✅ Request successfully processed leveraging target tenant identity!"

echo "----------------------------------------"
echo "✅ SUPER_ADMIN Impersonation verified natively!"
echo "----------------------------------------"
