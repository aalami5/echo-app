# Echo App

Oliver's personal AI assistant interface - a native iOS/macOS app to interact with Echo.

## Features

- 🎨 Beautiful dark theme inspired by Echo's avatar
- 🎤 Voice input (tap to record)
- 🔊 Voice output (TTS)
- 💬 Real-time chat with streaming responses
- 🔮 Animated avatar with state indicators
- 🔐 Secure authentication (2FA + biometrics)
- 📱 Works on iPhone, iPad, and Mac

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo Go app on your iPhone (for testing)
- Xcode (for iOS simulator)

### Installation

```bash
# Clone the repo
git clone https://github.com/aalami5/echo-app.git
cd echo-app

# Install dependencies
npm install

# Start the development server
npx expo start
```

### Running the App

**On iPhone (Expo Go):**
1. Install "Expo Go" from the App Store
2. Run `npx expo start` on your computer
3. Scan the QR code with your iPhone camera

**On iOS Simulator:**
```bash
npm run ios
```

**On Web (limited features):**
```bash
npm run web
```

## Architecture

```
src/
├── app/                 # Expo Router pages
│   ├── (tabs)/         # Tab navigation
│   │   ├── index.tsx   # Chat screen
│   │   └── explore.tsx # Settings screen
│   └── login.tsx       # Auth screen
├── components/         # Reusable UI components
│   ├── Avatar.tsx      # Animated Echo avatar
│   ├── ChatInput.tsx   # Message input + voice
│   └── ChatMessage.tsx # Chat bubbles
├── constants/
│   └── theme.ts        # Design system tokens
├── hooks/
│   └── useVoiceRecording.ts
├── lib/
│   ├── supabase.ts     # Auth client
│   └── websocket.ts    # Gateway connection
├── stores/
│   ├── authStore.ts    # Auth state (Zustand)
│   └── chatStore.ts    # Chat state (Zustand)
└── types/
    └── index.ts        # TypeScript types
```

## Configuration

### Environment Variables

Create `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_WS_URL=ws://localhost:8765
```

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable Email auth in Authentication settings
3. Enable MFA/2FA (optional but recommended)
4. Copy URL and anon key to `.env`

### Gateway Connection

The app connects to the OpenClaw Gateway via WebSocket:

- **Development:** `ws://localhost:8765`
- **Production:** Configure your server URL

The Gateway needs the `echo-app` channel plugin enabled.

## Design System

Based on Echo's avatar color palette:

| Token | Color | Usage |
|-------|-------|-------|
| `background` | `#0B1120` | App background |
| `surface` | `#162032` | Cards, inputs |
| `primary` | `#5CFFFA` | Buttons, accents |
| `textPrimary` | `#F8FAFC` | Main text |
| `textSecondary` | `#94A3B8` | Muted text |

## Avatar States

The avatar animates based on Echo's state:

- **Idle** — Gentle breathing pulse
- **Listening** — Expanded, bright glow
- **Thinking** — Slow rotation, pulsing core
- **Speaking** — Rhythmic sync pulse
- **Alert** — Attention-grabbing flash

## Roadmap

- [x] Phase 1: MVP scaffold
- [x] Phase 1: Design system
- [ ] Phase 1: Auth flow (Supabase)
- [ ] Phase 1: WebSocket connection
- [ ] Phase 1: Push notifications
- [ ] Phase 2: Animated avatar (Lottie)
- [ ] Phase 2: Rich cards
- [ ] Phase 3: iOS widgets
- [ ] Phase 3: Siri Shortcuts
- [ ] Phase 4: Apple Watch app

## License

Private - Oliver Aalami
