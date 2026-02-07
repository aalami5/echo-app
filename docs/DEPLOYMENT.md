# Deployment

> Build, Test & Release Guide

**Last Updated:** February 7, 2026

---

## Development Setup

### Prerequisites

- Node.js 18+ (v25 recommended)
- npm or yarn
- Xcode 15+ (for iOS builds)
- Expo Go app on iOS device (for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/aalami5/echo-app.git
cd echo-app

# Install dependencies
npm install

# Start development server
npx expo start
```

### Running on Device

**Expo Go (Quick testing):**

1. Install "Expo Go" from App Store
2. Run `npx expo start`
3. Scan QR code with iPhone camera

**iOS Simulator:**

```bash
npx expo run:ios
```

---

## Environment Variables

Create `.env` in project root:

```env
EXPO_PUBLIC_GATEWAY_URL=https://echo.oppersmedical.com
```

**Note:** API keys (OpenAI, ElevenLabs, Gateway token) are configured in-app via Settings, not environment variables.

---

## Build Profiles

Defined in `app.json`:

```json
{
  "expo": {
    "name": "Echo",
    "slug": "echo-app",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.aalami.echo",
      "supportsTablet": true
    }
  }
}
```

---

## Building for TestFlight

### Using EAS Build

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Configure EAS:
   ```bash
   eas build:configure
   ```

3. Build for iOS:
   ```bash
   eas build --platform ios --profile preview
   ```

4. Submit to TestFlight:
   ```bash
   eas submit --platform ios
   ```

### Using Xcode (Local Build)

1. Generate native project:
   ```bash
   npx expo prebuild --platform ios
   ```

2. Open in Xcode:
   ```bash
   open ios/echoapp.xcworkspace
   ```

3. Select your team in Signing & Capabilities

4. Archive and distribute via Xcode Organizer

---

## App Store Release

### Checklist

- [ ] Increment version in `app.json`
- [ ] Update CHANGELOG.md
- [ ] Test all features on physical device
- [ ] Check SecureStore persistence survives reinstall
- [ ] Verify gateway connectivity
- [ ] Test voice input/output
- [ ] Generate screenshots for App Store

### Metadata

**App Name:** Echo  
**Bundle ID:** `com.aalami.echo`  
**Category:** Productivity  
**Privacy:** See PRD.md Appendix C

---

## Gateway Deployment

The OpenClaw Gateway runs on Oliver's Mac Mini with Cloudflare Tunnel.

### Gateway URL

```
https://echo.oppersmedical.com
```

### Tunnel Setup

```bash
# Cloudflare tunnel (already running as service)
cloudflared tunnel run echo-gateway
```

### Gateway Config

Key settings for Echo App support:

```yaml
http:
  enabled: true
  port: 18789
  chat_completions:
    enabled: true
    auth:
      type: bearer
      tokens:
        - <gateway-token>
```

---

## Monitoring

### Crash Reporting

Currently using console logging. Sentry integration planned.

### Health Checks

The app performs gateway health check on startup:

```typescript
GET /ping
```

Status shown in avatar area ("Online" / "Offline").

---

## Troubleshooting

### Build Fails

```bash
# Clear caches
npx expo start --clear
rm -rf node_modules && npm install

# Reset iOS build
cd ios && rm -rf Pods && pod install
```

### SecureStore Issues

SecureStore may fail on iOS Simulator:

```bash
# Use physical device for testing persistence
# Or mock SecureStore in development
```

### Gateway Connection Issues

1. Check tunnel status: `cloudflared tunnel list`
2. Verify token in Settings matches gateway config
3. Check URL doesn't have trailing slash

---

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for release notes.
