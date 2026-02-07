# Echo App

Oliver's personal AI assistant interface — a native iOS app to interact with Echo.

![Platform](https://img.shields.io/badge/platform-iOS-lightgrey)
![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2052-blue)
![License](https://img.shields.io/badge/license-Private-red)

---

## Features

- 🎤 **Voice-First** — Tap the avatar to talk, Echo responds with voice
- 💬 **Text Chat** — Type when voice isn't convenient
- 🏥 **Patient Tracking** — On-call patient list with voice input and image scanning
- 🔐 **Secure Storage** — All data encrypted in iOS Keychain
- 🔮 **Animated Avatar** — Visual feedback for listening, thinking, speaking states
- 📱 **Native Feel** — Haptic feedback, smooth animations, dark theme

---

## Quick Start

### Prerequisites

- Node.js 18+
- Expo Go app on iPhone

### Run

```bash
# Clone
git clone https://github.com/aalami5/echo-app.git
cd echo-app

# Install
npm install

# Start
npx expo start
```

Scan the QR code with your iPhone camera to open in Expo Go.

---

## Configuration

Open the app → Settings tab and configure:

| Setting | Description |
|---------|-------------|
| **Gateway URL** | `https://echo.oppersmedical.com` |
| **Gateway Token** | Your authentication token |
| **OpenAI API Key** | For Whisper (voice transcription) |
| **ElevenLabs Key** | For TTS (voice output) |

---

## Architecture

```
┌─────────────────────────────────────┐
│            Echo App (iOS)           │
│                                     │
│  Chat │ Patients │ Calendar │ Settings
│                                     │
│        Zustand Stores (Persisted)   │
│        ─────────────────────────    │
│        expo-secure-store (Keychain) │
└──────────────────┬──────────────────┘
                   │ HTTPS
                   ▼
┌──────────────────────────────────────┐
│   OpenClaw Gateway (Mac Mini)        │
│   echo.oppersmedical.com             │
└──────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design.

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, security |
| [API.md](docs/API.md) | Gateway protocol, external services |
| [STORES.md](docs/STORES.md) | Zustand state management |
| [COMPONENTS.md](docs/COMPONENTS.md) | UI component library |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Build, test, release guide |
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [PRD.md](PRD.md) | Product requirements document |

---

## Project Structure

```
echo-app/
├── app/                    # Expo Router pages
│   └── (tabs)/            # Tab screens
├── src/
│   ├── components/        # UI components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API clients
│   ├── stores/            # Zustand stores
│   └── types/             # TypeScript types
├── docs/                  # Documentation
└── assets/                # Images, fonts
```

---

## Key Features

### Chat with Persistence

Messages are stored in iOS Keychain and survive:
- App crashes
- Force quit
- App updates
- Device restarts (with Keychain backup)

### Patient Tracking

- Organize patients by call day
- Group by hospital (SEQ, ECH, SMCMC, Mills)
- Voice input for chief complaint
- Scan images to extract patient details
- Export to CSV

### Voice Interaction

- **Input:** Tap avatar → record → Whisper transcription
- **Output:** ElevenLabs TTS with "River" voice

---

## Development

```bash
# Start dev server
npx expo start

# Run on iOS Simulator
npx expo run:ios

# Clear caches
npx expo start --clear
```

---

## Security

- All persistent data encrypted via expo-secure-store (iOS Keychain)
- Patient data stored locally only (never sent to cloud)
- HTTPS for all network traffic via Cloudflare Tunnel
- API keys stored securely on device

---

## Roadmap

- [ ] Push notifications
- [ ] Streaming responses
- [ ] iOS widgets
- [ ] Siri Shortcuts
- [ ] Apple Watch app

---

## License

Private — Oliver Aalami

---

*Built with ❤️ by Echo 🔮*
