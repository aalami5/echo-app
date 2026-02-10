/**
 * Supabase Client for Echo App
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We handle auth separately
  },
});

// Database types for push notifications
export interface DeviceToken {
  id: string;
  token: string;
  device_id: string;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
}

export interface NotificationAck {
  id: string;
  event_id: string;
  acked_at: string;
  created_at: string;
}
