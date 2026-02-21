#!/bin/bash
set -e

# Load env variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

API_URL="http://localhost:3000/admin"
ADMIN_TOKEN=${INTERNAL_ADMIN_TOKEN:-"test-admin-token"}

echo "1. Testing /admin/clients without token..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/clients")
if [ "$HTTP_STATUS" -ne 401 ]; then
  echo "Expected 401, got $HTTP_STATUS"
  exit 1
fi
echo "Got expected 401"

echo "2. Testing /admin/clients with token..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "x-admin-token: $ADMIN_TOKEN" "$API_URL/clients")
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "Expected 200, got $HTTP_STATUS"
  exit 1
fi
echo "Got expected 200"

echo "3. Testing /admin/clients OPTIONS preflight..."
ALLOW_HEADERS=$(curl -s -I -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" "$API_URL/clients" | grep -i "access-control-allow-headers" || true)
if echo "$ALLOW_HEADERS" | grep -iq "x-admin-token"; then
    echo "Preflight successful, x-admin-token is allowed."
else
    echo "Preflight failed: x-admin-token is not in Access-Control-Allow-Headers"
    echo "Actual Headers:"
    curl -s -I -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" "$API_URL/clients"
    exit 1
fi

echo "✅ CORS tests passed!"
