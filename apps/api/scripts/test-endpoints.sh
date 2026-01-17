#!/bin/bash
# =============================================================================
# CRM API Endpoint Test Script
# Tests all 43 endpoints with various users and permission levels
# =============================================================================

set -e

BASE_URL="${API_URL:-http://localhost:3001}"
COOKIE_DIR="/tmp/crm-test-cookies"
PASSWORD="TestPassword123!"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# IDs stored during tests
AGENT_ID=""
ACCOUNT_ID=""
CLIENT_ID=""
ROLE_ID=""
SESSION_ID=""

# =============================================================================
# Helper Functions
# =============================================================================

setup() {
  rm -rf "$COOKIE_DIR"
  mkdir -p "$COOKIE_DIR"
  echo -e "${BLUE}=== CRM API Endpoint Tests ===${NC}"
  echo -e "${BLUE}Base URL: $BASE_URL${NC}"
  echo ""
}

cleanup() {
  echo ""
  echo -e "${BLUE}=== Test Summary ===${NC}"
  echo -e "${GREEN}Passed: $PASSED${NC}"
  echo -e "${RED}Failed: $FAILED${NC}"
  echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
  echo ""

  if [ $FAILED -gt 0 ]; then
    exit 1
  fi
}

trap cleanup EXIT

login_user() {
  local email=$1
  local cookie_file="$COOKIE_DIR/$email.txt"

  curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$email\", \"password\": \"$PASSWORD\"}" \
    -c "$cookie_file" > /dev/null 2>&1

  echo "$cookie_file"
}

test_endpoint() {
  local method=$1
  local path=$2
  local expected_status=$3
  local cookie_file=$4
  local data=$5
  local description=$6

  local args=("-s" "-o" "/dev/null" "-w" "%{http_code}" "-X" "$method")

  if [ -n "$cookie_file" ] && [ -f "$cookie_file" ]; then
    args+=("-b" "$cookie_file")
  fi

  if [ -n "$data" ]; then
    args+=("-H" "Content-Type: application/json" "-d" "$data")
  fi

  args+=("$BASE_URL$path")

  local actual_status
  actual_status=$(curl "${args[@]}")

  if [ "$actual_status" == "$expected_status" ]; then
    echo -e "${GREEN}✓${NC} $method $path ($description) - $actual_status"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $method $path ($description) - Expected: $expected_status, Got: $actual_status"
    ((FAILED++))
    return 1
  fi
}

test_endpoint_save() {
  local method=$1
  local path=$2
  local expected_status=$3
  local cookie_file=$4
  local data=$5
  local description=$6
  local jq_path=$7

  local args=("-s" "-X" "$method")

  if [ -n "$cookie_file" ] && [ -f "$cookie_file" ]; then
    args+=("-b" "$cookie_file")
  fi

  if [ -n "$data" ]; then
    args+=("-H" "Content-Type: application/json" "-d" "$data")
  fi

  args+=("$BASE_URL$path")

  local response
  response=$(curl "${args[@]}")
  local actual_status
  actual_status=$(echo "$response" | head -1 2>/dev/null || echo "000")

  # Get HTTP status from header
  local full_response
  full_response=$(curl -s -w "\n%{http_code}" -X "$method" \
    ${cookie_file:+-b "$cookie_file"} \
    ${data:+-H "Content-Type: application/json" -d "$data"} \
    "$BASE_URL$path")

  actual_status=$(echo "$full_response" | tail -1)
  local body
  body=$(echo "$full_response" | sed '$d')

  if [ "$actual_status" == "$expected_status" ]; then
    echo -e "${GREEN}✓${NC} $method $path ($description) - $actual_status"
    ((PASSED++))

    if [ -n "$jq_path" ]; then
      echo "$body" | jq -r "$jq_path" 2>/dev/null || echo ""
    else
      echo "$body"
    fi
    return 0
  else
    echo -e "${RED}✗${NC} $method $path ($description) - Expected: $expected_status, Got: $actual_status"
    echo "Response: $body"
    ((FAILED++))
    echo ""
    return 1
  fi
}

section() {
  echo ""
  echo -e "${YELLOW}--- $1 ---${NC}"
}

# =============================================================================
# Setup - Login all users
# =============================================================================

setup

section "Logging in test users"

ADMIN_COOKIE=$(login_user "admin@acme.test")
echo "Logged in admin@acme.test"

MANAGER_COOKIE=$(login_user "manager@acme.test")
echo "Logged in manager@acme.test"

VIEWER_COOKIE=$(login_user "viewer@acme.test")
echo "Logged in viewer@acme.test"

AGENT_MGR_COOKIE=$(login_user "agent-only@acme.test")
echo "Logged in agent-only@acme.test"

# =============================================================================
# Public Endpoints
# =============================================================================

section "Public Endpoints"

test_endpoint "GET" "/" "200" "" "" "Root endpoint"
test_endpoint "GET" "/health" "200" "" "" "Health check"

# =============================================================================
# Auth Endpoints - Public
# =============================================================================

section "Auth Endpoints (Public)"

test_endpoint "POST" "/auth/forgot-password" "200" "" '{"email":"nonexistent@test.com"}' "Forgot password (always 200)"
test_endpoint "POST" "/auth/reset-password" "401" "" '{"token":"invalid","password":"NewPass123"}' "Reset password (invalid token)"
test_endpoint "POST" "/auth/verify-email" "401" "" '{"token":"invalid"}' "Verify email (invalid token)"
test_endpoint "POST" "/auth/resend-verification" "200" "" '{"email":"nonexistent@test.com"}' "Resend verification (always 200)"

# =============================================================================
# Auth Endpoints - Protected
# =============================================================================

section "Auth Endpoints (Protected)"

test_endpoint "GET" "/auth/me" "200" "$ADMIN_COOKIE" "" "Get current user (admin)"
test_endpoint "GET" "/auth/me" "200" "$VIEWER_COOKIE" "" "Get current user (viewer)"
test_endpoint "GET" "/auth/me" "401" "" "" "Get current user (no auth)"

test_endpoint "PATCH" "/auth/profile" "200" "$ADMIN_COOKIE" '{"firstName":"Updated"}' "Update profile"

test_endpoint "GET" "/auth/sessions" "200" "$ADMIN_COOKIE" "" "List sessions"

# Get a session ID for testing (we'll skip delete to not break our session)
echo -e "${YELLOW}⊘${NC} DELETE /auth/sessions/:id - Skipped (would break test session)"
((SKIPPED++))

# =============================================================================
# RBAC Endpoints
# =============================================================================

section "RBAC Endpoints"

test_endpoint "GET" "/rbac/permissions" "200" "$ADMIN_COOKIE" "" "List permissions (admin)"
test_endpoint "GET" "/rbac/permissions" "200" "$VIEWER_COOKIE" "" "List permissions (viewer)"

test_endpoint "GET" "/rbac/roles" "200" "$ADMIN_COOKIE" "" "List roles (admin)"
test_endpoint "GET" "/rbac/roles" "200" "$VIEWER_COOKIE" "" "List roles (viewer)"

# Create a test role
ROLE_RESPONSE=$(curl -s -X POST "$BASE_URL/rbac/roles" \
  -H "Content-Type: application/json" \
  -b "$ADMIN_COOKIE" \
  -d '{"name":"Test Role","description":"A test role"}')
ROLE_ID=$(echo "$ROLE_RESPONSE" | jq -r '.role.id // empty')

if [ -n "$ROLE_ID" ]; then
  echo -e "${GREEN}✓${NC} POST /rbac/roles (Create role) - 201"
  ((PASSED++))

  test_endpoint "GET" "/rbac/roles/$ROLE_ID" "200" "$ADMIN_COOKIE" "" "Get role by ID"
  test_endpoint "PATCH" "/rbac/roles/$ROLE_ID" "200" "$ADMIN_COOKIE" '{"description":"Updated description"}' "Update role"

  # Test permission boundary
  test_endpoint "POST" "/rbac/roles" "403" "$VIEWER_COOKIE" '{"name":"Forbidden Role"}' "Create role (viewer - forbidden)"
  test_endpoint "PATCH" "/rbac/roles/$ROLE_ID" "403" "$VIEWER_COOKIE" '{"description":"Try update"}' "Update role (viewer - forbidden)"

  # Set permissions
  test_endpoint "PUT" "/rbac/roles/$ROLE_ID/permissions" "200" "$ADMIN_COOKIE" '{"permissionIds":[]}' "Set role permissions"

  # Delete role
  test_endpoint "DELETE" "/rbac/roles/$ROLE_ID" "204" "$ADMIN_COOKIE" "" "Delete role"
else
  echo -e "${RED}✗${NC} POST /rbac/roles (Create role) - Failed to create"
  ((FAILED++))
fi

# =============================================================================
# Agents Endpoints
# =============================================================================

section "Agents Endpoints"

# List agents
test_endpoint "GET" "/agents" "200" "$ADMIN_COOKIE" "" "List agents (admin)"
test_endpoint "GET" "/agents" "200" "$AGENT_MGR_COOKIE" "" "List agents (agent manager)"
test_endpoint "GET" "/agents" "200" "$VIEWER_COOKIE" "" "List agents (viewer)"

# Create agent
AGENT_RESPONSE=$(curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -b "$ADMIN_COOKIE" \
  -d '{"firstName":"Test","lastName":"Agent","email":"test.agent@test.com"}')
AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.agent.id // empty')

if [ -n "$AGENT_ID" ]; then
  echo -e "${GREEN}✓${NC} POST /agents (Create agent) - 201"
  ((PASSED++))

  test_endpoint "GET" "/agents/$AGENT_ID" "200" "$ADMIN_COOKIE" "" "Get agent by ID"
  test_endpoint "PATCH" "/agents/$AGENT_ID" "200" "$ADMIN_COOKIE" '{"phone":"+1-555-9999"}' "Update agent"

  # Test permission boundaries
  test_endpoint "POST" "/agents" "403" "$VIEWER_COOKIE" '{"firstName":"Blocked","lastName":"Agent"}' "Create agent (viewer - forbidden)"

  # Manager should be able to manage agents
  test_endpoint "GET" "/agents/$AGENT_ID" "200" "$MANAGER_COOKIE" "" "Get agent (manager)"
  test_endpoint "PATCH" "/agents/$AGENT_ID" "200" "$MANAGER_COOKIE" '{"phone":"+1-555-8888"}' "Update agent (manager)"
else
  echo -e "${RED}✗${NC} POST /agents (Create agent) - Failed to create"
  ((FAILED++))
fi

# =============================================================================
# Accounts Endpoints
# =============================================================================

section "Accounts Endpoints"

# Get an existing agent ID for account creation
EXISTING_AGENT=$(curl -s -X GET "$BASE_URL/agents" -b "$ADMIN_COOKIE" | jq -r '.agents[0].id // empty')

test_endpoint "GET" "/accounts" "200" "$ADMIN_COOKIE" "" "List accounts (admin)"
test_endpoint "GET" "/accounts" "200" "$MANAGER_COOKIE" "" "List accounts (manager)"
test_endpoint "GET" "/accounts" "403" "$AGENT_MGR_COOKIE" "" "List accounts (agent manager - no accounts:read)"

# Create account
if [ -n "$EXISTING_AGENT" ]; then
  ACCOUNT_RESPONSE=$(curl -s -X POST "$BASE_URL/accounts" \
    -H "Content-Type: application/json" \
    -b "$ADMIN_COOKIE" \
    -d "{\"agentId\":\"$EXISTING_AGENT\",\"name\":\"Test Account\"}")
  ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | jq -r '.account.id // empty')

  if [ -n "$ACCOUNT_ID" ]; then
    echo -e "${GREEN}✓${NC} POST /accounts (Create account) - 201"
    ((PASSED++))

    test_endpoint "GET" "/accounts/$ACCOUNT_ID" "200" "$ADMIN_COOKIE" "" "Get account by ID"
    test_endpoint "PATCH" "/accounts/$ACCOUNT_ID" "200" "$ADMIN_COOKIE" '{"name":"Updated Account"}' "Update account"

    # Test permission boundaries
    test_endpoint "POST" "/accounts" "403" "$AGENT_MGR_COOKIE" "{\"agentId\":\"$EXISTING_AGENT\",\"name\":\"Blocked\"}" "Create account (agent manager - forbidden)"
  else
    echo -e "${RED}✗${NC} POST /accounts (Create account) - Failed to create"
    ((FAILED++))
  fi
else
  echo -e "${YELLOW}⊘${NC} POST /accounts - Skipped (no agent available)"
  ((SKIPPED++))
fi

# =============================================================================
# Clients Endpoints
# =============================================================================

section "Clients Endpoints"

# Get an existing account ID for client creation
EXISTING_ACCOUNT=$(curl -s -X GET "$BASE_URL/accounts" -b "$ADMIN_COOKIE" | jq -r '.accounts[0].id // empty')

test_endpoint "GET" "/clients" "200" "$ADMIN_COOKIE" "" "List clients (admin)"
test_endpoint "GET" "/clients" "200" "$MANAGER_COOKIE" "" "List clients (manager)"
test_endpoint "GET" "/clients" "403" "$AGENT_MGR_COOKIE" "" "List clients (agent manager - no clients:read)"

# Create individual client
if [ -n "$EXISTING_ACCOUNT" ]; then
  CLIENT_RESPONSE=$(curl -s -X POST "$BASE_URL/clients" \
    -H "Content-Type: application/json" \
    -b "$ADMIN_COOKIE" \
    -d "{\"accountId\":\"$EXISTING_ACCOUNT\",\"clientType\":\"individual\",\"firstName\":\"Test\",\"lastName\":\"Client\",\"email\":\"test.client@test.com\"}")
  CLIENT_ID=$(echo "$CLIENT_RESPONSE" | jq -r '.client.id // empty')

  if [ -n "$CLIENT_ID" ]; then
    echo -e "${GREEN}✓${NC} POST /clients (Create individual client) - 201"
    ((PASSED++))

    test_endpoint "GET" "/clients/$CLIENT_ID" "200" "$ADMIN_COOKIE" "" "Get client by ID"
    test_endpoint "PATCH" "/clients/$CLIENT_ID" "200" "$ADMIN_COOKIE" '{"phone":"+1-555-7777"}' "Update client"

    # Test permission boundaries
    test_endpoint "POST" "/clients" "403" "$AGENT_MGR_COOKIE" "{\"accountId\":\"$EXISTING_ACCOUNT\",\"clientType\":\"individual\",\"firstName\":\"Blocked\",\"lastName\":\"Client\"}" "Create client (agent manager - forbidden)"
  else
    echo -e "${RED}✗${NC} POST /clients (Create client) - Failed to create"
    echo "Response: $CLIENT_RESPONSE"
    ((FAILED++))
  fi

  # Create business client
  BIZ_CLIENT_RESPONSE=$(curl -s -X POST "$BASE_URL/clients" \
    -H "Content-Type: application/json" \
    -b "$ADMIN_COOKIE" \
    -d "{\"accountId\":\"$EXISTING_ACCOUNT\",\"clientType\":\"business\",\"companyName\":\"Test Corp\",\"email\":\"info@testcorp.test\"}")
  BIZ_CLIENT_ID=$(echo "$BIZ_CLIENT_RESPONSE" | jq -r '.client.id // empty')

  if [ -n "$BIZ_CLIENT_ID" ]; then
    echo -e "${GREEN}✓${NC} POST /clients (Create business client) - 201"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} POST /clients (Create business client) - Failed to create"
    echo "Response: $BIZ_CLIENT_RESPONSE"
    ((FAILED++))
  fi
else
  echo -e "${YELLOW}⊘${NC} POST /clients - Skipped (no account available)"
  ((SKIPPED++))
fi

# =============================================================================
# Invitations Endpoints
# =============================================================================

section "Invitations Endpoints"

test_endpoint "GET" "/auth/invitations" "200" "$ADMIN_COOKIE" "" "List invitations (admin)"
test_endpoint "GET" "/auth/invitations" "403" "$AGENT_MGR_COOKIE" "" "List invitations (agent manager - no permission)"

# Create invitation would need a non-admin role ID
EXISTING_ROLE=$(curl -s -X GET "$BASE_URL/rbac/roles" -b "$ADMIN_COOKIE" | jq -r '.roles[] | select(.name != "Admin") | .id' | head -1)

if [ -n "$EXISTING_ROLE" ]; then
  INVITE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/invite" \
    -H "Content-Type: application/json" \
    -b "$ADMIN_COOKIE" \
    -d "{\"email\":\"invited@test.com\",\"roleId\":\"$EXISTING_ROLE\"}")

  INVITE_STATUS=$(echo "$INVITE_RESPONSE" | tail -1)

  if [ "$INVITE_STATUS" == "201" ]; then
    echo -e "${GREEN}✓${NC} POST /auth/invite (Create invitation) - 201"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} POST /auth/invite (Create invitation) - Expected: 201, Got: $INVITE_STATUS"
    ((FAILED++))
  fi
else
  echo -e "${YELLOW}⊘${NC} POST /auth/invite - Skipped (no non-admin role found)"
  ((SKIPPED++))
fi

# =============================================================================
# Delete Tests (run last to clean up)
# =============================================================================

section "Delete Operations"

# Delete client
if [ -n "$CLIENT_ID" ]; then
  test_endpoint "DELETE" "/clients/$CLIENT_ID" "204" "$ADMIN_COOKIE" "" "Delete client"
  test_endpoint "GET" "/clients/$CLIENT_ID" "404" "$ADMIN_COOKIE" "" "Verify client deleted"
fi

if [ -n "$BIZ_CLIENT_ID" ]; then
  test_endpoint "DELETE" "/clients/$BIZ_CLIENT_ID" "204" "$ADMIN_COOKIE" "" "Delete business client"
fi

# Delete account (only if no clients left)
if [ -n "$ACCOUNT_ID" ]; then
  test_endpoint "DELETE" "/accounts/$ACCOUNT_ID" "204" "$ADMIN_COOKIE" "" "Delete account"
  test_endpoint "GET" "/accounts/$ACCOUNT_ID" "404" "$ADMIN_COOKIE" "" "Verify account deleted"
fi

# Delete agent (only if no accounts left)
if [ -n "$AGENT_ID" ]; then
  test_endpoint "DELETE" "/agents/$AGENT_ID" "204" "$ADMIN_COOKIE" "" "Delete agent"
  test_endpoint "GET" "/agents/$AGENT_ID" "404" "$ADMIN_COOKIE" "" "Verify agent deleted"
fi

# =============================================================================
# Cross-Org Isolation Test
# =============================================================================

section "Security Tests"

# Try to access with no cookie
test_endpoint "GET" "/agents" "401" "" "" "Access agents without auth"
test_endpoint "GET" "/accounts" "401" "" "" "Access accounts without auth"
test_endpoint "GET" "/clients" "401" "" "" "Access clients without auth"
test_endpoint "GET" "/rbac/roles" "401" "" "" "Access roles without auth"

# Viewer permission boundary tests
test_endpoint "POST" "/agents" "403" "$VIEWER_COOKIE" '{"firstName":"X","lastName":"Y"}' "Viewer cannot create agent"
test_endpoint "POST" "/accounts" "403" "$VIEWER_COOKIE" '{"agentId":"x","name":"Y"}' "Viewer cannot create account"
test_endpoint "POST" "/clients" "403" "$VIEWER_COOKIE" '{"accountId":"x","clientType":"individual","firstName":"X","lastName":"Y"}' "Viewer cannot create client"

echo ""
echo -e "${BLUE}=== All Tests Completed ===${NC}"
