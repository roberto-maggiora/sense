#!/bin/bash
set -e

API_URL="http://localhost:3000"
EMAIL="admin@sense.local"
PASSWORD="admin123"

echo "1. Resetting SUPER_ADMIN password via script..."
npm run docker:reset:admin

echo "2. Attempting login as $EMAIL..."
LOGIN_RES=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RES | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to retrieve authentication token."
  echo "Response was: $LOGIN_RES"
  exit 1
fi
echo "✅ Logged in successfully. Token acquired."

echo "3. Fetching /auth/me to verify SUPER_ADMIN and clientless payload..."
ME_RES=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "$API_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN")

HTTP_CODE=$(echo "$ME_RES" | grep "HTTP_CODE" | cut -d':' -f2)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to hit /me. HTTP $HTTP_CODE"
  echo "$ME_RES"
  exit 1
fi

ROLE=$(echo "$ME_RES" | grep -o '"role":"[^"]*' | cut -d'"' -f4)
if [ "$ROLE" != "SUPER_ADMIN" ]; then
  echo "❌ Expected role SUPER_ADMIN, got $ROLE"
  exit 1
fi

CLIENT_ID=$(echo "$ME_RES" | grep -o '"client_id":null')
if [ -z "$CLIENT_ID" ]; then
  echo "❌ Expected client_id to be null."
  echo "$ME_RES"
  exit 1
fi

echo "✅ /me returns SUPER_ADMIN with null client_id."
echo "----------------------------------------"
echo "✅ SUPER_ADMIN Authentication and Reset Verified!  "
echo "----------------------------------------"
