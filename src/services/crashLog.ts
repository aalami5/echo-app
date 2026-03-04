import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@echo_crash_logs';
const MAX_ENTRIES = 20;

export interface CrashLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  context?: string;
}

export async function getCrashLogs(): Promise<CrashLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrashLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[CrashLog] Failed to load logs:', error);
    return [];
  }
}

export async function logCrash(error: Error, context?: string): Promise<void> {
  try {
    const logs = await getCrashLogs();
    const entry: CrashLogEntry = {
      timestamp: new Date().toISOString(),
      message: error.message || 'Unknown error',
      stack: error.stack,
      context,
    };
    const nextLogs = [...logs, entry].slice(-MAX_ENTRIES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextLogs));
  } catch (err) {
    console.warn('[CrashLog] Failed to write log:', err);
  }
}

export async function clearCrashLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[CrashLog] Failed to clear logs:', error);
  }
}

export async function getLastCrashLog(): Promise<CrashLogEntry | null> {
  const logs = await getCrashLogs();
  if (logs.length === 0) return null;
  return logs[logs.length - 1];
}
