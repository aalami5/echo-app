# Push Notifications Setup

## Overview

Echo app supports three types of push notifications:
1. **Meeting Reminders** - 15 minutes before calendar events
2. **New Message Alerts** - When app is backgrounded and new messages arrive
3. **Daily Brief** - Morning summary at 6:30 AM

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   OpenClaw  │────▶│ Echo Server │────▶│ Expo Push   │
│   Gateway   │     │  (notify)   │     │   Service   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Supabase   │     │  Echo App   │
                    │ (tokens/ack)│     │  (iOS/And)  │
                    └─────────────┘     └─────────────┘
```

## Setup Checklist

### 1. Supabase Migration (REQUIRED)
Run this SQL in Supabase SQL Editor:
https://supabase.com/dashboard/project/mshgthoogedzdoqgcgcj/sql

```sql
-- See: supabase/migrations/003_push_notifications.sql
```

### 2. Server Environment
The Echo server needs these environment variables:
- `SUPABASE_URL` (optional, has default)
- `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY` (for token lookup)
- `OPENCLAW_GATEWAY_TOKEN` or `AUTH_TOKEN` (for auth)

### 3. OpenClaw Integration
OpenClaw can trigger notifications via the Echo server:

```bash
# Meeting reminder
curl -X POST http://localhost:18790/notify/meeting \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"abc123","title":"Team Standup","startTime":"2024-02-10T09:00:00","minutesBefore":15}'

# New message
curl -X POST http://localhost:18790/notify/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"preview":"Hey Oliver, quick question...","sender":"Echo"}'

# Daily brief  
curl -X POST http://localhost:18790/notify/brief \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary":"5 meetings today","meetingCount":5,"firstMeeting":"9:00 AM Standup"}'
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notify` | POST | Generic notification |
| `/notify/meeting` | POST | Meeting reminder |
| `/notify/message` | POST | New message alert |
| `/notify/brief` | POST | Daily brief |
| `/notify/tokens` | GET | Check registered tokens |

## Meeting Reminder Flow

1. OpenClaw checks calendar every 5 minutes
2. For meetings starting in 15 minutes:
   - Check if already acknowledged (Supabase `notification_acks`)
   - If not, send push via Echo server
3. When user taps notification:
   - App opens to calendar view
   - Meeting is marked as acknowledged

## Daily Brief Flow

1. Cron job at 6:30 AM triggers daily brief
2. OpenClaw generates summary of the day
3. Push notification sent with meeting count + first meeting

## Troubleshooting

### No notifications received
1. Check if device token is registered: `GET /notify/tokens`
2. Verify Supabase tables exist
3. Check server logs for errors
4. Ensure app has notification permissions

### Meeting reminders not working
1. Check if meeting is already acknowledged
2. Verify event ID format matches calendar
3. Check cron job is running

## Files

- `src/services/notifications.ts` - Client-side notification handling
- `src/hooks/useNotifications.ts` - React hook for notifications
- `server/index.js` - Server-side push sending
- `supabase/migrations/003_push_notifications.sql` - Database schema
- `scripts/notify.sh` - CLI helper for testing
