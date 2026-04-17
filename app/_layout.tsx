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
import { logCrash } from '../src/services/crashLog';
import { supabase } from '../src/lib/supabase';
import { ensureGatewayConfig } from '../src/services/gatewayBootstrap';

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

  useEffect(() => {
    const errorUtils = (global as any)?.ErrorUtils;
    if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) return;

    const defaultHandler = errorUtils.getGlobalHandler();
    const handler = (err: unknown, isFatal?: boolean) => {
      if (err instanceof Error) {
        logCrash(err, isFatal ? 'fatal' : 'unhandled');
      } else {
        logCrash(new Error(String(err)), isFatal ? 'fatal' : 'unhandled');
      }

      if (typeof defaultHandler === 'function') {
        defaultHandler(err, isFatal);
      }
    };

    errorUtils.setGlobalHandler(handler);
    return () => {
      if (typeof defaultHandler === 'function') {
        errorUtils.setGlobalHandler(defaultHandler);
      }
    };
  }, []);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadStoredAuth, setUser, setTokens, logout } = useAuthStore();
  
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

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange:', event, 'session:', !!session);
      if (event === 'SIGNED_OUT') {
        await logout();
        useAuthStore.setState({ isLoading: false });
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            createdAt: session.user.created_at || new Date().toISOString(),
          });
          await setTokens(session.access_token, session.refresh_token || null);
          useAuthStore.setState({ isLoading: false, isAuthenticated: true });
        } else if (event === 'INITIAL_SESSION') {
          useAuthStore.setState({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [logout, setTokens, setUser]);
  
  // Log push notification registration status
  useEffect(() => {
    if (isRegistered) {
      console.log('Push notifications registered, token:', pushToken?.substring(0, 20) + '...');
    }
  }, [isRegistered, pushToken]);

  // Bootstrap gateway config once authenticated and settings are hydrated
  useEffect(() => {
    if (!isAuthenticated || !settingsHydrated) return;
    ensureGatewayConfig().then((ok) => {
      if (!ok) console.warn('[Layout] Gateway bootstrap failed — will retry next launch');
    });
  }, [isAuthenticated, settingsHydrated]);

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
        <Stack.Screen name="patient-dictation" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
