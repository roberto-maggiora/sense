#!/bin/bash
set -e

# Load env variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

API_URL="http://localhost:3000"

echo "1. Attempting Login with seed credentials..."
LOGIN_RESP=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email":"admin@test.com","password":"admin123"}' "$API_URL/auth/login")

TOKEN=$(echo $LOGIN_RESP | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Failed to obtain JWT token."
    echo $LOGIN_RESP
    exit 1
fi

echo "✅ Login successful. Token obtained."

echo "2. Fetching /auth/me..."
ME_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/auth/me")

USER_EMAIL=$(echo $ME_RESP | jq -r '.user.email')
CLIENT_NAME=$(echo $ME_RESP | jq -r '.client.name')

if [ "$USER_EMAIL" != "admin@test.com" ]; then
    echo "❌ Failed to authenticate /me endpoint."
    echo $ME_RESP
    exit 1
fi

echo "✅ /auth/me verified. Client is $CLIENT_NAME"

echo "3. Testing Client-scoped data access (/api/v1/dashboard/summary)"
DASHBOARD_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/v1/dashboard/summary")
TOTAL_DEVICES=$(echo $DASHBOARD_RESP | jq -r '.data.total_devices')

if [ "$TOTAL_DEVICES" == "null" ]; then
    # Fastify actually returns it flat based on the controller.
    TOTAL_DEVICES=$(echo $DASHBOARD_RESP | jq -r '.total_devices')
fi

if [ "$TOTAL_DEVICES" == "null" ] || [ -z "$TOTAL_DEVICES" ]; then
    echo "❌ Failed to fetch dashboard summary."
    echo $DASHBOARD_RESP
    exit 1
fi

echo "✅ Dashboard access verified. Devices seen: $TOTAL_DEVICES"
echo "✅ Auth tests passed successfully."
