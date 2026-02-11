#!/bin/bash
# Send push notifications via Echo server
# Usage: ./scripts/notify.sh <type> [args...]
# Types: meeting, message, brief, test

SERVER_URL="${ECHO_SERVER_URL:-http://localhost:18790}"
AUTH_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$AUTH_TOKEN}"

send_notification() {
  local endpoint=$1
  local data=$2
  
  curl -s -X POST "$SERVER_URL$endpoint" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "$data"
}

case "$1" in
  meeting)
    # Usage: ./notify.sh meeting "event-id" "Meeting Title" "2024-02-10T17:00:00" "Location" 15
    send_notification "/notify/meeting" "{\"eventId\":\"$2\",\"title\":\"$3\",\"startTime\":\"$4\",\"location\":\"$5\",\"minutesBefore\":${6:-15}}"
    ;;
  message)
    # Usage: ./notify.sh message "Preview text" "Sender name"
    send_notification "/notify/message" "{\"preview\":\"$2\",\"sender\":\"$3\"}"
    ;;
  brief)
    # Usage: ./notify.sh brief "Summary" 5 "9:00 AM Meeting"
    send_notification "/notify/brief" "{\"summary\":\"$2\",\"meetingCount\":${3:-0},\"firstMeeting\":\"$4\"}"
    ;;
  test)
    # Usage: ./notify.sh test
    send_notification "/notify" "{\"title\":\"🔔 Test Notification\",\"body\":\"Push notifications are working!\",\"data\":{\"type\":\"test\"}}"
    ;;
  tokens)
    # Check registered tokens
    curl -s "$SERVER_URL/notify/tokens" -H "Authorization: Bearer $AUTH_TOKEN"
    ;;
  *)
    echo "Usage: $0 <meeting|message|brief|test|tokens> [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 test                                    # Send test notification"
    echo "  $0 meeting 'evt123' 'Team Sync' '' '' 15   # Meeting reminder"
    echo "  $0 message 'Hello!' 'Echo'                 # New message"
    echo "  $0 brief 'Busy day ahead' 5 'Standup'      # Daily brief"
    echo "  $0 tokens                                  # Check registered tokens"
    exit 1
    ;;
esac
