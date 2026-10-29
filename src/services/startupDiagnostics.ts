import { NativeModules } from 'react-native';
type Phase = 'root_mounted' | 'fonts_ready' | 'settings_hydrated' | 'auth_load_requested' | 'js_fatal' | 'js_unhandled';
export function markStartup(phase: Phase): void {
  try { NativeModules.EchoDiagnosticBridge?.mark(phase); } catch { /* Diagnostics must not affect startup. */ }
}
