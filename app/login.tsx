import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useAuthStore } from '../src/stores/authStore';
import { Avatar } from '../src/components/Avatar';
import { colors, spacing, borderRadius, typography } from '../src/constants/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { login, signUp } = useAuthStore();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    
    try {
      const result = isSignUp 
        ? await signUp(email.trim(), password)
        : await login(email.trim(), password);

      if (!result.success) {
        Alert.alert(
          isSignUp ? 'Sign Up Failed' : 'Login Failed',
          result.error || 'Please check your credentials and try again.'
        );
      } else if (isSignUp) {
        Alert.alert(
          'Account Created',
          'Please check your email to verify your account, then log in.',
          [{ text: 'OK', onPress: () => setIsSignUp(false) }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.background, '#0D1526', colors.background]}
      style={styles.container}
    >
      <KeyboardAwareScrollView
        style={styles.keyboardView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={100}
        enableOnAndroid={true}
      >
          {/* Logo / Avatar */}
          <View style={styles.logoContainer}>
            <Avatar state="idle" size={100} />
            <Text style={styles.title}>Echo</Text>
            <Text style={styles.subtitle}>Your AI companion</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
              />
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryMuted]}
                style={styles.submitButton}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsSignUp(!isSignUp)}
              style={styles.switchModeButton}
            >
              <Text style={styles.switchModeText}>
                {isSignUp
                  ? 'Already have an account? Sign In'
                  : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Version */}
          <Text style={[styles.version, { paddingBottom: insets.bottom + spacing.md }]}>
            v0.1.0
          </Text>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.sm,
    fontWeight: '500',
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  submitButton: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonText: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textInverse,
  },
  switchModeButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  switchModeText: {
    fontSize: typography.sm,
    color: colors.primary,
  },
  version: {
    textAlign: 'center',
    fontSize: typography.sm,
    color: colors.textTertiary,
  },
});
