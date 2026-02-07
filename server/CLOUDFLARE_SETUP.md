# Cloudflare Tunnel Configuration

The Echo patient sync server needs to be added to the Cloudflare tunnel.

## Current Setup

The tunnel routes `echo.oppersmedical.com` to the OpenClaw gateway on port 18789.

We need to add routing for `/patients/*` to the patient sync server on port 18790.

## Update via Cloudflare Dashboard

1. Log in to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Go to **Networks** → **Tunnels**
3. Find the tunnel serving `echo.oppersmedical.com`
4. Click **Configure** → **Public Hostname**
5. Add a new public hostname:
   - **Subdomain**: (leave blank for same domain)
   - **Domain**: `oppersmedical.com`
   - **Path**: `/patients`
   - **Type**: HTTP
   - **URL**: `localhost:18790`

This will route `https://echo.oppersmedical.com/patients/*` to the local sync server.

## Alternative: Update Ingress Rules

If using a config file, add this ingress rule **before** the catch-all:

```yaml
ingress:
  - hostname: echo.oppersmedical.com
    path: /patients/*
    service: http://localhost:18790
  - hostname: echo.oppersmedical.com
    service: http://localhost:18789
  - service: http_status:404
```

## Test the Configuration

After updating, test with:

```bash
# Ping (no auth)
curl https://echo.oppersmedical.com/patients/ping

# Search (requires auth)
curl "https://echo.oppersmedical.com/patients/search?q=smith" \
  -H "Authorization: Bearer <your-token>"
```

## Sync Endpoint

The Echo app syncs to: `https://echo.oppersmedical.com/patients/sync`

This endpoint receives the full patient state on every add/update/delete.
