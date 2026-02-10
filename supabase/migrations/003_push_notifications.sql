-- Push Notification Infrastructure for Echo App
-- Migration: 003_push_notifications.sql

-- Device tokens table for storing push notification tokens
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL,
    device_id TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick token lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);

-- Notification acknowledgments table
-- Tracks when meeting reminders are acknowledged to stop further reminders
CREATE TABLE IF NOT EXISTS notification_acks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    acked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id)
);

-- Index for quick ack lookups
CREATE INDEX IF NOT EXISTS idx_notification_acks_event_id ON notification_acks(event_id);

-- Clean up old acks (keep only last 7 days)
-- This can be run periodically via a Supabase function or cron
CREATE OR REPLACE FUNCTION cleanup_old_notification_acks()
RETURNS void AS $$
BEGIN
    DELETE FROM notification_acks
    WHERE acked_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- RLS Policies (assuming we want open access for now since this is a single-user app)
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_acks ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON device_tokens
    FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated users" ON notification_acks
    FOR ALL USING (true);

-- Grant access to anon role for the app
GRANT ALL ON device_tokens TO anon;
GRANT ALL ON notification_acks TO anon;

COMMENT ON TABLE device_tokens IS 'Stores push notification tokens for Echo app devices';
COMMENT ON TABLE notification_acks IS 'Tracks acknowledged meeting reminders to prevent duplicate notifications';
