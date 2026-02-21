#!/bin/bash
set -e

# Load env variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

API_URL="http://localhost:3000/admin"
ADMIN_TOKEN=${INTERNAL_ADMIN_TOKEN:-"test-admin-token"}

echo "Using API_URL: $API_URL"

echo "1. List Clients"
curl -s -f -H "x-admin-token: $ADMIN_TOKEN" "$API_URL/clients" > /tmp/admin_clients.json
cat /tmp/admin_clients.json
echo ""

CLIENT_ID=$(cat /tmp/admin_clients.json | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -n "$CLIENT_ID" ]; then
    echo "Using Client ID: $CLIENT_ID"
    
    echo "2. List Users for Client"
    curl -s -f -H "x-admin-token: $ADMIN_TOKEN" "$API_URL/users?client_id=$CLIENT_ID" > /tmp/admin_users.json
    cat /tmp/admin_users.json
    echo ""
    
    # Create test client to verify creation
    NEW_CLIENT_NAME="Test Script Client $(date +%s)"
    echo "3. Create Client: $NEW_CLIENT_NAME"
    curl -s -f -X POST -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"name\": \"$NEW_CLIENT_NAME\"}" "$API_URL/clients" > /tmp/admin_new_client.json
    NEW_CLIENT_ID=$(cat /tmp/admin_new_client.json | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
    echo "Created: $NEW_CLIENT_ID"

    # Disable test client
    echo "4. Disable Client: $NEW_CLIENT_ID"
    DATE_STR=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    curl -s -f -X PATCH -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"disabled_at\": \"$DATE_STR\"}" "$API_URL/clients/$NEW_CLIENT_ID" > /dev/null
    
    echo "✅ Admin API tests passed"
else
    echo "No clients found. Did you run the seed script?"
    exit 1
fi

echo "OK"
