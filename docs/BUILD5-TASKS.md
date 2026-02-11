# Build #5 Tasks

## App Icon & Splash Screen (Oliver request - Feb 11)

**Source image:** `assets/images/echo-icon-new.jpg`

### Tasks:
1. **App Icon** — Use new Echo logo (concentric circles, cyan on dark navy)
   - Generate all required sizes for iOS (1024x1024, etc.)
   - Update `app.json` icon reference

2. **Splash Screen** — Full-screen version of logo
   - Dark navy background (#0a1628 or similar from image)
   - Centered Echo logo
   - Update `app.json` splash config

### Background color to match:
- Dark navy/slate: approximately `#0a1628` or `#0d1b2a`

### Reference:
- Current splash: `assets/images/splash-icon.png`
- Current icon: `assets/images/icon.png`

---

## Calendar Sync Optimization (Oliver request - Feb 11)

**Problem:** App blocks during calendar sync on startup (minutes!)

**Solution:** Stale-while-revalidate pattern
1. **Persist calendar locally** — AsyncStorage/MMKV so cached data survives restart
2. **Show cached immediately** — App launches fast with yesterday's calendar
3. **Background refresh** — Update in background, don't block UI
4. **Visual indicator** — Small spinner when refreshing, not blocking modal

See: `docs/CALENDAR-OPTIMIZATION.md` for full research

---

## Other Build #5 Items (from CHANGELOG)
- Network status UI indicators
- Message delivery status
