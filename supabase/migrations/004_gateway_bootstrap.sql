-- Gateway Bootstrap Token Exchange
-- Level 2 security: authenticated users can retrieve gateway config
-- The gateway token is NOT in the app binary — only in the database

-- Config table (restricted, no direct access)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS SELECT for regular users — they go through the RPC function
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- No policies = no direct access. Only the SECURITY DEFINER function can read.

-- Insert the gateway config (will be updated via Supabase dashboard/SQL editor)
INSERT INTO app_config (key, value) VALUES
    ('gateway_url', 'https://echo.oppersmedical.com'),
    ('gateway_token', 'b9683d1d227c47b04a061b5cc28fcce076c06a0f7e66b0da')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- RPC function: returns gateway config ONLY for authenticated users
-- SECURITY DEFINER runs as the function owner (postgres), bypassing RLS
CREATE OR REPLACE FUNCTION get_gateway_config()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    user_id UUID;
BEGIN
    -- Verify caller is authenticated
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Return gateway config
    SELECT json_build_object(
        'gateway_url', (SELECT value FROM app_config WHERE key = 'gateway_url'),
        'gateway_token', (SELECT value FROM app_config WHERE key = 'gateway_token')
    ) INTO result;

    RETURN result;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION get_gateway_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_gateway_config() TO authenticated;
