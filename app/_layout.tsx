import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { useAuthStore } from '../src/stores/authStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useNotifications } from '../src/hooks/useNotifications';
import { colors } from '../src/constants/theme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Custom dark theme matching our design
const EchoDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.primary,
  },
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadStoredAuth } = useAuthStore();
  
  // Track settings store hydration to avoid premature auth redirects.
  // Before hydration, gatewayToken is null (Zustand default) — not a real sign-out.
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  useEffect(() => {
    if (useSettingsStore.persist.hasHydrated()) {
      setSettingsHydrated(true);
    } else {
      const unsub = useSettingsStore.persist.onFinishHydration(() => {
        setSettingsHydrated(true);
        unsub();
      });
      return () => unsub();
    }
  }, []);
  
  // Register for push notifications
  const { pushToken, isRegistered } = useNotifications();

  // Load stored auth on app start
  useEffect(() => {
    loadStoredAuth();
  }, []);
  
  // Log push notification registration status
  useEffect(() => {
    if (isRegistered) {
      console.log('Push notifications registered, token:', pushToken?.substring(0, 20) + '...');
    }
  }, [isRegistered, pushToken]);

  // Handle auth state changes — wait for BOTH auth loading AND settings hydration
  useEffect(() => {
    if (isLoading || !settingsHydrated) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, settingsHydrated, segments]);

  return (
    <ThemeProvider value={EchoDarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
