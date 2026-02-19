# Components

> UI Component Library

**Last Updated:** February 18, 2026

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

**Message Status States:**
- `sending` — Message in flight
- `sent` — Delivered successfully
- `failed` — Error occurred (shows "Tap to retry")
- `thinking` — AI is processing (shows ThinkingIndicator)

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

Displays connection quality with signal strength bars.

**File:** `src/components/NetworkIndicator.tsx`

**Features:**
- 3-tier visual indicator (good/fair/poor)
- Auto-updates from networkStore
- Compact signal bar design

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

### Chat Screen

**File:** `app/(tabs)/index.tsx`

Main conversation interface with:
- Animated Avatar (tap to record)
- Message list with auto-scroll
- Text input toggle
- Photo attachment button
- Next meeting card

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

---

### Settings Screen

**File:** `app/(tabs)/explore.tsx`

App configuration:
- Gateway URL and token
- Voice settings (on/off, voice selection)
- API key management
- Haptic feedback toggle

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

- `container` — Root wrapper
- `header` — Top section
- `content` — Main scrollable area
- `footer` / `bottomBar` — Bottom fixed section
- `*Row` — Horizontal flex container
- `*Input` — Text input field
- `*Button` — Touchable element
- `*Text` — Text element within component
