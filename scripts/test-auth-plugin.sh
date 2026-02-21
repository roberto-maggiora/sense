#!/bin/bash

API_URL="http://localhost:3000/api/v1/dashboard/summary"
CLIENT_ID="test-client"

echo "Testing API Auth Plugin..."

# Test 1: Missing Header
echo "1. Requesting without X-Client-Id (Expect 400)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL")

if [ "$HTTP_CODE" -eq 400 ]; then
    echo "SUCCESS: Got 400 Bad Request as expected."
else
    echo "FAILURE: Expected 400, got $HTTP_CODE"
    exit 1
fi

# Test 2: Valid Header
echo "2. Requesting with X-Client-Id: $CLIENT_ID (Expect 200)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Client-Id: $CLIENT_ID" "$API_URL")

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "SUCCESS: Got 200 OK."
else
    echo "FAILURE: Expected 200, got $HTTP_CODE"
    exit 1
fi
