# Components

> UI Component Library

**Last Updated:** October 26, 2026

---

## Overview

Echo App uses a custom component library built with React Native primitives, following a consistent design system defined in `src/constants/theme.ts`.

---

## Design System

### Colors

```typescript
export const colors = {
  // Backgrounds
  background: '#0B1120',      // App background
  surface: '#162032',         // Cards, inputs
  surfaceHover: '#1E2A3E',    // Hover states
  
  // Brand
  primary: '#5CFFFA',         // Cyan accent (Echo's color)
  primaryMuted: '#3DCFCA',    // Dimmed primary
  
  // Text
  textPrimary: '#F8FAFC',     // Main text
  textSecondary: '#94A3B8',   // Muted text
  textTertiary: '#64748B',    // Disabled text
  textInverse: '#0F172A',     // Text on primary
  
  // Semantic
  success: '#10B981',         // Green
  warning: '#F59E0B',         // Amber
  error: '#EF4444',           // Red
  
  // Borders
  border: '#1E293B',          // Default border
  borderFocused: '#5CFFFA',   // Focused input
};
```

### Spacing

```typescript
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};
```

### Typography

```typescript
export const typography = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
```

---

## Hooks

### useScaledTypography

Returns scaled typography values based on user's text size preference.

**File:** `src/hooks/useScaledTypography.ts`

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `messageText` | `number` | Scaled font size for chat messages |
| `inputText` | `number` | Scaled font size for text input |
| `lineHeight` | `number` | Scaled line height for messages |

**Usage:**

```tsx
import { useScaledTypography } from '../hooks/useScaledTypography';

function ChatMessage({ message }) {
  const { messageText, lineHeight } = useScaledTypography();
  
  return (
    <Text style={{ fontSize: messageText, lineHeight }}>
      {message.content}
    </Text>
  );
}
```

**Scale Values:**

| Setting | messageText | inputText | lineHeight |
|---------|-------------|-----------|------------|
| `normal` | 16 | 16 | 24 |
| `large` | 18 | 18 | 27 |
| `xlarge` | 20 | 20 | 30 |

---

## Core Components

### BriefReportBuilder

**File:** `src/components/BriefReportBuilder.tsx`

Legacy source-first modal, retained in source but removed from both live dictation screens in Build 80. Those screens now use direct `/compose` generation. OCR work in this component retains successful pages and processes up to two screenshots concurrently.

| Prop | Type | Purpose |
|------|------|---------|
| `caseId` | `string` | Current case/report identity |
| `parts` | `TranscriptPart[]` | Typed, dictated, or screenshot sources |
| `procedures` | `string[]` | Procedure hints, not case evidence |
| `onSource` | `(part: TranscriptPart) => void` | Retains extracted OCR and case corrections |
| `onComplete` | `(result: DraftResult, procedures: string[], fingerprint: string) => void` | Returns reviewed pipeline output and source snapshot |

Shows procedure matches, quoted facts, source text, and grouped clarification items. Offers editable routine-technique suggestions from approved profiles, reference outlines, or saved examples. Confirming steps for this case is separate from approving a reusable profile; editing steps clears case confirmation. Unapplied clarifications block generation. Busy/error/retry states preserve sources, and completion produces a draft only—nothing is automatically finalized or emailed.

---

### ReportDraftNote

**File:** `src/components/ReportDraftNote.tsx` (Build 81)

Review-only drafting provenance above the report in both dictation screens. Accepts `report: string` and optional `defaults: RoutineDefault[]` (section/text pairs). Combines stored metadata with legacy inline suggestions, deduplicates entries, and renders nothing if there are no defaults. Reminds the reviewer that edits take precedence; it is never concatenated into readback, clipboard, export, or email text.

`src/utils/reportPresentation.ts` provides `separateRoutineDefaults()` for clean presentation and metadata extraction, plus `reportForAIEditing()` for section-scoped model input. Verification/unreadable markers remain visible.

---

### ReportEmailStatus

**File:** `src/components/ReportEmailStatus.tsx`

Receipt-backed status used in standalone dictation, patient report detail/history, and patient cards.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `reportId` | `string?` | — | Stable report identity across edits |
| `report` | `string \| null` | Required | Current content for version comparison |
| `tracked` | `boolean` | `false` | Distinguishes new tracked reports from legacy unknown history |
| `details` | `boolean` | `false` | Shows last emailed local date/time and recipient list |

Subscribes to `useEmailReceiptsStore` and derives status with `emailReceiptStatus()`. Displays “✓ Sent,” “Sent · Updated since last email,” “Not sent,” or “Send history unknown,” with the same accessibility label. Renders nothing when there is neither report content nor a confirmed receipt. Sent reflects Gmail acceptance, not recipient delivery/read confirmation.

---

### Avatar

Animated circular avatar that represents Echo's state.

**File:** `src/components/Avatar.tsx`

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `state` | `AvatarState` | `'idle'` | Animation state |
| `size` | `number` | `100` | Diameter in pixels |
| `onPress` | `() => void` | - | Tap handler |
| `isRecording` | `boolean` | `false` | Show recording indicator |
| `audioLevel` | `number` | `0` | Audio level (0-1) for animation |

**States:**

| State | Visual |
|-------|--------|
| `idle` | Gentle pulse animation |
| `listening` | Expanded with waveform |
| `thinking` | Orbiting particles |
| `speaking` | Rhythmic pulse |
| `alert` | Attention flash |

**Usage:**

```tsx
<Avatar
  state={isRecording ? 'listening' : avatarState}
  size={100}
  onPress={handleVoiceInput}
  isRecording={isRecording}
  audioLevel={audioLevel}
/>
```

---

### ChatMessage

Displays a single message bubble.

**File:** `src/components/ChatMessage.tsx`

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `message` | `Message` | Message data |
| `onSpeak` | `(text: string) => void` | TTS callback for speaker button |

**Features:**
- User messages aligned right (cyan background)
- Assistant messages aligned left (surface background)
- Image preview for attached photos
- Timestamp display
- **Speaker button** on assistant messages (tap for TTS playback)
- **ThinkingIndicator** for "thinking" status messages
  - Pulsing dots animation while AI is processing
  - Shows placeholder text: "Got it, working on this..."
- **MeetingReplyCard** for assistant messages whose `message.card.type` is `meeting_reply`
  - Shows suggested available times and checked conflicts
  - Displays a bounded reply preview
  - Copies the generated reply text via `expo-clipboard`
- Long-press detail sheet exposes **Copy reply** for meeting-reply cards, using the card reply text when present

**Message Status States:**
- `sending` - Message in flight
- `sent` - Delivered successfully
- `failed` - Error occurred (shows "Tap to retry")
- `thinking` - AI is processing (shows ThinkingIndicator)

**Usage:**

```tsx
<FlatList
  data={messages}
  renderItem={({ item }) => (
    <ChatMessage 
      message={item} 
      onSpeak={handleSpeak}
    />
  )}
  keyExtractor={(item) => item.id}
/>
```

---

### NextMeeting

Displays the next upcoming calendar event.

**File:** `src/components/NextMeeting.tsx`

**Features:**
- Shows next meeting with time remaining
- Tappable to expand details
- Loading state during fetch

**Usage:**

```tsx
<NextMeeting />
```

---

### NetworkIndicator

Displays connection quality with signal strength bars and transport mode.

**File:** `src/components/NetworkIndicator.tsx`

**Features:**
- 4-tier visual indicator (excellent/good/poor/offline)
- Auto-updates from networkStore and websocketStore
- Compact signal bar design
- **Polling mode badge (Build 52):** Shows yellow swap icon and "Limited" label when transport falls back to HTTP long-polling
- Tappable for latency details

**Usage:**

```tsx
<NetworkIndicator />
```

---

### ToastContainer

Overlay for ephemeral toast notifications.

**File:** `src/components/ToastContainer.tsx`

**Features:**
- Stacked notifications with animations
- Auto-dismiss with configurable duration
- 4 types: success, error, info, warning
- Tap to dismiss early

**Usage:**

```tsx
// Add to root layout
<ToastContainer />

// Trigger toasts from anywhere
const { addToast } = useNetworkStore();
addToast({ type: 'success', message: 'Message sent!', duration: 2000 });
```

---

### ImagePickerModal

Modal for selecting photos from camera or library. Includes a caption input field and keyboard-aware scrolling for the image preview.

**File:** `src/components/ImagePicker.tsx`

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `onImageSelected` | `(uri: string, base64?: string, mimeType?: string, caption?: string) => void` | Selection callback (base64 + mimeType for vision, caption for context) |
| `onCancel` | `() => void` | Cancel callback |

**Features:**
- Optional caption/question input (defaults to "What do you see in this image?")
- Image preview scrolls up and shrinks when keyboard opens (Build #31 fix)
- Camera and photo library source selection
- Build 78 preserves the full frame (no crop), normalizes HEIC/other supported images to JPEG, and bounds width to 2200px before returning image data

**Usage:**

```tsx
{showImagePicker && (
  <ImagePickerModal
    onImageSelected={handleImageSelected}
    onCancel={() => setShowImagePicker(false)}
  />
)}
```

---

## Screen Components

### ChatViewport (Build 84)

**File:** `src/components/ChatViewport.tsx`

**Props:** `children: React.ReactNode`.

Layout wrapper for `AssistantScreen`, used within the bottom-tab navigator and safe-area provider. It reserves the measured `useBottomTabBarHeight()` while the keyboard is hidden, then removes that bottom padding while the keyboard is visible. The Chat tab enables `tabBarHideOnKeyboard` in `app/(tabs)/_layout.tsx`.

The inner `KeyboardAvoidingView` applies top safe-area padding, iOS `padding` behavior, zero keyboard offset, and `minHeight: 0`. Keyboard visibility initializes from `Keyboard.isVisible()` where available; listeners use will-show/hide events on iOS and did-show/hide elsewhere, with cleanup on unmount. Test IDs are `chat-viewport` and `chat-keyboard-area`.

### AssistantScreen / Chat tab (Builds 82–92)

**File:** `src/screens/AssistantScreen.tsx`, rendered by `app/(tabs)/index.tsx`.

Build 92 uses the existing 54-point `VoiceIconButton` for the shared voice/chat attachment menu: `camera-outline` (Camera), `images-outline` (Photo Library), `document-outline` (Files) and `close` (Cancel). Accessible action labels remain available; picker actions disable while media is busy, while Cancel stays available. The icon row wraps with 8-point gaps. Picker handlers, previews, explicit sending and voice lifecycle are unchanged. See [change and release evidence](changes/attachment-menu-icons.md); physical-iPhone layout/picker acceptance remains pending.

- Home/project selector and new-conversation sheet; typed messages and Live Voice use the selected native conversation.
- Paginated message list, incremental responses, copy/share actions, tappable web links, and Jump to latest without forcing readers away from older messages.
- Live Voice start/end and mute/unmute controls via `useRealtimeVoice(conversationId)`; ending a call does not cancel accepted work.
- Files via `expo-document-picker`, system Photos selection, and Live Camera share draft preparation, previews and Send behavior. Authenticated artifact download/share uses `expo-file-system` and `expo-sharing`.
- Activity sheet shows native run/task state and submission receipts, with confirmation for exact-run stop. Uncertain delivery offers same-request reconciliation rather than a new action.
- Memory sheet displays curated sources and sends remember/correct/forget requests to Echo; changes are confirmed in Home, not treated as transactional local edits.
- Inbox & earlier chats preserves `chatStore` content without replaying historical requests. The old avatar recorder, photo-only composer, and next-meeting card are no longer the main Chat tab interface.

Builds 84–85 wrap the screen in `ChatViewport`. Conversation controls scroll within a maximum 45% viewport height; the message list can shrink and supports interactive keyboard dismissal. The non-shrinking composer (`chat-composer`) bounds attachment previews to 72 points and multiline input to 44–120 points. Connection controls stay compact, hide the spinner after an error, and offer Reconnect. Modal sheets respect the bottom safe area.

Screen-local `Button` supplies labeled touch controls; `MessageText` renders selectable text and HTTP(S) links. Local result files use authenticated artifact cards instead of arbitrary file URLs. `src/services/assistant.ts` owns API calls, public-history normalization, persistent submissions, and abandoned-call cleanup; no new Zustand store was introduced.

Builds 86–88 add voice/text switching with a compact call strip in text, More for conversations/Activity/Memory/Inbox, and long-press message Copy/Share. Live Voice now renders inline in `ChatViewport`, preserving bottom-tab navigation. Text/attachment drafts persist by conversation; camera closes on tab departure, background or Hang up without discarding the draft. Tab changes do not stop audio.

### VoiceOrb (Build 89)

**File:** `src/components/VoiceOrb.tsx`.

Personal-voice visual, separate from the clinical Avatar. Props are `color`, `mode`, `level` and `motionEnabled`; modes cover idle, listening, working, speaking, connecting, paused and muted. Three outward-lighter rings surround a solid center, with staggered breathing and bounded measured-audio response during listening/speaking. Working/connecting adjust breathing; paused/muted stop breathing. Hidden/background/Reduce Motion disables motion through the parent, and effects stop animations on cleanup. No fabricated speech pulses.

### VoiceCallView / VoiceIconButton (Builds 86–93)

**File:** `src/components/VoiceCallView.tsx`.

Inline voice presentation using `VoiceOrb` for the original three graduated rings and solid center, with state labels/colors, measured audio-level animation, optional captions, Reduce Motion support and labeled icon buttons. It renders Connect, startup Retry and muted Resume audio recovery as appropriate; current controls include microphone, Chat, a shared + attachment menu (Camera, Photo Library, Files) and Hang up. `onAttach` toggles the shared menu; `onText` switches to Chat without disconnecting. Switching to Chat or hanging up closes the camera/menu while preserving drafts. `content` can replace the ring area with camera preview; `draftContent` hosts the shared attachment draft. Hidden views render nothing; animation lifecycle is separate from the app-scoped call.

Build 94 removes the Build 93 `taskContent` slot and the Tasks / Show all panel beneath the voice state label, without adding a replacement row or spacer. `VoiceIconButton` accepts `muted`, retaining the slashed microphone while applying a faded red background (`#663F49`), border and lighter icon distinct from the Hang up danger background (`#9F2835`).

### VoiceTaskPanel (Build 93; unmounted in Build 94)

**File:** `src/components/VoiceTaskPanel.tsx`. **Props:** `tasks`, `unavailable`, `loading`, `onDiscuss`.

Owner-private task view with collapse/expand, active count, Show all/Active only, status icons and a bounded scrollable list. Active filtering excludes `completed`, `failed`, `cancelled` and `run_finished`; the latter describes execution completion, not verified external success. Loading, empty and unavailable/last-known states are distinct.

A task-context modal shows title, status, timestamp, source channel labels, goal, summary, next step, evidence and notes. Discuss closes the modal and calls `onDiscuss(id)`. In Build 93, `AssistantScreen` used this callback to prepare a Chat draft and owned four-second foreground/focus-gated polling of `/patients/assistant/tasks`. Build 94 removes that integration and polling; the component source remains but is no longer mounted by the screen. The panel adds no persistent store. The separate More → Activity view remains available.

The separate browser Talk view in `gateway/browser-tasks.mjs` provides read-only task rows, history and inline context using its authenticated RPC client. See [Build 93 release scope](changes/build93-shared-tasks.md) for deployment and physical-device verification limits.

### AssistantCamera (Build 88)

**File:** `src/components/AssistantCamera.tsx`. **Props:** `busy`, `onCapture`, `onClose`.

Permission-aware `expo-camera` still-photo preview with front/back selection, capture, review, retake and explicit Add photo. Permission denial offers settings when needed. Add photo stages a draft; Send is separate. Camera uses picture mode without microphone capture and does not stream video to Echo.

### AssistantAttachmentTray (Build 88)

**File:** `src/components/AssistantAttachmentTray.tsx`.

Shared draft previews for voice/text: image thumbnails or file indicators, filenames, removal controls and disabled state during busy operations. Preparation and uploads live in `src/services/assistantMedia.ts`; limits are five attachments and 6 MB each, with no upload before Send.

Release status and physical-phone acceptance limitations: [Build 88](changes/build-88-media-navigation.md) and [Build 86 lifecycle](changes/build-86-voice-first.md).

---

### Dictation Screen

**File:** `app/(tabs)/dictation.tsx`

OR dictation for generating structured operative reports:
- Tag-based procedure picker (pill/chip UI) with categories: Aortic, Carotid, Peripheral Arterial, Venous, Dialysis Access, Other
- Custom procedure tags (add, edit via long-press, delete, persisted via AsyncStorage)
- Multi-modal transcript input: voice recording, text, photo
- Draft-first generation uses authenticated OCR and resumable `/compose`, without a mandatory analysis/technique questionnaire; `ReportDraftNote` keeps routine provenance outside report text
- Report actions: email, copy, TTS read-back, save as example
- **Two edit modes:** Edit Text Directly and Edit with AI; AI receives the displayed draft and preserves unrelated manual changes
- "New Dictation" button in review state to start fresh without navigating away
- Save reports as examples for future reusable-technique proposals, subject to explicit review

**Supporting Files:**
- `src/services/dictationService.ts` - Report generation service
- `src/stores/dictationStore.ts` - Session + persisted state
- `src/data/vascularProcedures.ts` - Categorized procedure library

---

### Patients Screen

**File:** `app/(tabs)/patients.tsx`

On-call patient tracking with:
- Expandable call day sections
- Hospital grouping
- Quick add FAB
- Voice input for chief complaint
- Image scanning for patient info
- Search functionality
- CSV export
- **Op Report button** on each patient card - shows draft indicator badge, opens patient-linked dictation

---

### Patient Dictation Screen

**File:** `app/patient-dictation.tsx` (modal)

Patient-linked operative report dictation with full workflow:
- Auto-populated header (Dr. Aalami + patient name + MRN + date)
- Date of operation picker
- Smart procedure pre-selection from chief complaint
- Voice/text/photo input (reuses dictation infrastructure)
- Draft-first `/compose` generation with clean read-back (TTS) and separate `ReportDraftNote`
- No mandatory source-review/technique panel; retain stale-source checks, manual-edit provenance, and explicit finalization/email
- Direct text editing and targeted AI edits of the displayed report
- **Read Back play/pause controls (Build 53):** Processing spinner → Play button when audio ready → Pause/Resume during playback, with haptic feedback on audio ready
- Per-patient report history timeline
- Draft auto-save (10s debounce)
- Quick duplicate from previous report
- Export encounter bundle (patient + report + CPT codes)
- Email, copy, read-back actions

**Screen States:** `input` → `generating` → `review` → `editing` / `direct-editing`
**Screen Modes:** `new` | `continue` (resume draft) | `view` (read-only final)

---

### Settings Screen

**File:** `app/(tabs)/explore.tsx`

App configuration:
- Gateway URL and token
- Voice settings (on/off, voice selection)
- API key management
- Haptic feedback toggle
- Crash Logs - View and clear stored crash logs (max 20 entries)

---

## Patterns

### Modal Pattern

```tsx
<Modal
  visible={showModal}
  animationType="slide"
  presentationStyle="pageSheet"
  onRequestClose={() => setShowModal(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.modalContainer}
  >
    <View style={styles.modalContent}>
      {/* Header with Cancel/Save */}
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => setShowModal(false)}>
          <Text style={styles.modalCancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>Title</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text style={styles.modalSave}>Save</Text>
        </TouchableOpacity>
      </View>
      
      {/* Content */}
      <ScrollView>{/* form fields */}</ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

### Form Input Pattern

```tsx
<Text style={styles.formLabel}>Label *</Text>
<TextInput
  style={styles.formInput}
  placeholder="Placeholder"
  placeholderTextColor={colors.textTertiary}
  value={value}
  onChangeText={setValue}
  autoCapitalize="words"
/>
```

### Haptic Feedback Pattern

```tsx
import * as Haptics from 'expo-haptics';

// On button press
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// On success
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// On selection
Haptics.selectionAsync();
```

---

## Styling Conventions

### StyleSheet

All styles use `StyleSheet.create()`:

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Use theme constants
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  // Consistent spacing
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
});
```

### Naming Conventions

- `container` - Root wrapper
- `header` - Top section
- `content` - Main scrollable area
- `footer` / `bottomBar` - Bottom fixed section
- `*Row` - Horizontal flex container
- `*Input` - Text input field
- `*Button` - Touchable element
- `*Text` - Text element within component
