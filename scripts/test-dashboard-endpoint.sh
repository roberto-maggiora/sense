#!/bin/bash
API_ROOT="http://localhost:3000/api/v1/dashboard"
CLIENT_ID="test-client"

echo "1. Seeding Dashboard Data..."
npx ts-node -r dotenv/config scripts/seed-dashboard.ts

echo -e "\n2. Fetching Dashboard Devices (Expect Red -> Amber -> Green -> Grey)..."
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/devices?limit=10" | jq -c '.data[] | {name: .name, status: .current_status.status}'

echo -e "\n3. Testing Status Filter (Expect only Red)..."
curl -s -H "X-Client-Id: $CLIENT_ID" "$API_ROOT/devices?limit=10&status=red" | jq -c '.data[] | {name: .name, status: .current_status.status}'
