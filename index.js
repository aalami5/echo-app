// Capture the earliest JS milestone before router imports hydrate any stores.
const { NativeModules } = require('react-native');
try { NativeModules.EchoDiagnosticBridge?.mark('js_entry'); } catch {}
const storage = require('@react-native-async-storage/async-storage').default;
require('./src/services/startupStorageProbe').installStartupStorageProbe(storage, NativeModules.EchoDiagnosticBridge);
require('expo-router/entry');
