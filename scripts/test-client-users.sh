#!/bin/bash
set -e

# Load env variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

API_URL="http://localhost:3000"

echo "1. Attempting Login with CLIENT_ADMIN credentials..."
LOGIN_RESP=$(curl -s -X POST -H "Content-Type: application/json" -d '{"email":"clientadmin@test.com","password":"admin123"}' "$API_URL/auth/login")
TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Failed to obtain JWT token."
    echo $LOGIN_RESP
    exit 1
fi
echo "✅ Login successful. Token obtained."

echo "2. Fetching /api/v1/users..."
USERS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/v1/users")
TOTAL_USERS=$(echo "$USERS_RESP" | grep -o 'email' | wc -l | tr -d ' ')

if [ "$TOTAL_USERS" -lt "1" ]; then
    echo "❌ Failed to fetch client users."
    echo $USERS_RESP
    exit 1
fi
echo "✅ /api/v1/users verified. Users found: $TOTAL_USERS"

echo "3. Creating a new SITE_ADMIN user..."
CREATE_RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"email":"scriptuser@test.com","name":"Script User","role":"SITE_ADMIN","password":"tempPassword123"}' "$API_URL/api/v1/users")
NEW_USER_ID=$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ "$NEW_USER_ID" == "null" ] || [ -z "$NEW_USER_ID" ]; then
    echo "❌ Failed to create user."
    echo $CREATE_RESP
    exit 1
fi
echo "✅ User created successfully. ID: $NEW_USER_ID"

echo "4. Updating the user's name..."
UPDATE_RESP=$(curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Updated Name"}' "$API_URL/api/v1/users/$NEW_USER_ID")
UPDATED_NAME=$(echo "$UPDATE_RESP" | grep -o '"name":"[^"]*' | cut -d'"' -f4)

if [ "$UPDATED_NAME" != "Updated Name" ]; then
    echo "❌ Failed to update user."
    echo $UPDATE_RESP
    exit 1
fi
echo "✅ User updated successfully."

echo "5. Disabling the user..."
DISABLE_RESP=$(curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"disabled":true}' "$API_URL/api/v1/users/$NEW_USER_ID")
DISABLED_AT=$(echo "$DISABLE_RESP" | grep -o '"disabled_at":"[^"]*' | cut -d'"' -f4)

if [ "$DISABLED_AT" == "null" ] || [ -z "$DISABLED_AT" ]; then
    echo "❌ Failed to disable user."
    echo $DISABLE_RESP
    exit 1
fi
echo "✅ User disabled successfully."

echo "6. Resetting the user's password..."
RESET_RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"password":"newPassword456"}' "$API_URL/api/v1/users/$NEW_USER_ID/reset-password")
OK_STATUS=$(echo "$RESET_RESP" | grep -o '"ok":true')

if [ -z "$OK_STATUS" ]; then
    echo "❌ Failed to reset password."
    echo $RESET_RESP
    exit 1
fi
echo "✅ Password reset successfully."

echo "✅ All Client Admin User endpoints functionally verified!"
