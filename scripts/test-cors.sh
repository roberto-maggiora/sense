#!/bin/bash
API_URL="http://localhost:3000/api/v1/dashboard/summary"
CLIENT_ID="test-client"

echo "Testing API connectivity (CORS check)..."
echo "Requesting: $API_URL"
echo "Header: X-Client-Id: $CLIENT_ID"

# Use curl -I to check headers visually, and -v to see everything if needed, 
# but here we just want to see if it works.
# including -H "Origin: http://localhost:5173" to simulate browser request
curl -v \
  -H "X-Client-Id: $CLIENT_ID" \
  -H "Origin: http://localhost:5173" \
  "$API_URL"

echo ""
echo "If you see 'HTTP/1.1 200 OK' and 'access-control-allow-origin: http://localhost:5173', CORS is configured."
