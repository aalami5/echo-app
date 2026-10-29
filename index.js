// Capture the earliest JS milestone before router imports hydrate any stores.
const { NativeModules } = require('react-native');
try { NativeModules.EchoDiagnosticBridge?.mark('js_entry'); } catch {}
require('expo-router/entry');
