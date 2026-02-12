/**
 * Push Notification Service for Echo App
 * 
 * Handles:
 * - Push token registration
 * - Meeting reminders (15 min before)
 * - New message alerts when app is backgrounded
 * - Daily brief notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notification types
export type NotificationType = 'meeting' | 'message' | 'brief';

export interface NotificationData {
  type: NotificationType;
  eventId?: string;
  title?: string;
  body?: string;
  meetingTime?: string;
  messageId?: string;
  messageContent?: string;
  timestamp?: string;
}

const DEVICE_PUSH_TOKEN_KEY = 'device_push_token';

/**
 * Register for push notifications and return the token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    const token = tokenResponse.data;
    console.log('Push token:', token);

    // Cache native device push token (APNs/FCM) for gateway fallback
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      if (deviceToken?.data) {
        await AsyncStorage.setItem(DEVICE_PUSH_TOKEN_KEY, deviceToken.data);
      }
    } catch (deviceTokenError) {
      console.warn('Error getting device push token:', deviceTokenError);
    }

    // Store token in Supabase
    await storeDeviceToken(token);

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Store device token in Supabase for server-side push
 */
async function storeDeviceToken(token: string): Promise<void> {
  try {
    // Use a stable device identifier
    const deviceId = Constants.installationId || 'unknown';
    const platform = Platform.OS as 'ios' | 'android';

    const { error } = await supabase
      .from('device_tokens')
      .upsert({
        token,
        device_id: deviceId,
        platform,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'device_id',
      });

    if (error) {
      console.error('Error storing device token:', error);
    } else {
      console.log('Device token stored successfully');
    }
  } catch (error) {
    console.error('Error in storeDeviceToken:', error);
  }
}

/**
 * Remove device token (on logout)
 */
export async function removeDeviceToken(): Promise<void> {
  try {
    const deviceId = Constants.installationId || 'unknown';
    
    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('device_id', deviceId);

    if (error) {
      console.error('Error removing device token:', error);
    }
  } catch (error) {
    console.error('Error in removeDeviceToken:', error);
  }
}

/**
 * Acknowledge a meeting notification (stops further reminders for this event)
 */
export async function acknowledgeMeetingNotification(eventId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notification_acks')
      .upsert({
        event_id: eventId,
        acked_at: new Date().toISOString(),
      }, {
        onConflict: 'event_id',
      });

    if (error) {
      console.error('Error acknowledging notification:', error);
    }
  } catch (error) {
    console.error('Error in acknowledgeMeetingNotification:', error);
  }
}

/**
 * Check if a meeting notification has been acknowledged
 */
export async function isNotificationAcked(eventId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('notification_acks')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking notification ack:', error);
    }

    return !!data;
  } catch (error) {
    console.error('Error in isNotificationAcked:', error);
    return false;
  }
}

/**
 * Set up handler for incoming notifications (app in foreground)
 */
export function setupNotificationReceivedHandler(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Set up handler for notification taps
 */
export function setupNotificationResponseHandler(
  onMeetingTap: (eventId: string) => void,
  onMessageTap: (messageData?: { id: string; content: string; timestamp: string }) => void,
  onBriefTap: () => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as unknown as NotificationData;
    
    // Acknowledge meeting notifications when tapped
    if (data.type === 'meeting' && data.eventId) {
      acknowledgeMeetingNotification(data.eventId);
      onMeetingTap(data.eventId);
    } else if (data.type === 'message') {
      const messageData = data.messageId && data.messageContent && data.timestamp
        ? { id: data.messageId, content: data.messageContent, timestamp: data.timestamp }
        : undefined;
      onMessageTap(messageData);
    } else if (data.type === 'brief') {
      onBriefTap();
    }
  });
}

/**
 * Schedule a local notification (for testing)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data: NotificationData,
  triggerSeconds: number = 1
): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data as unknown as Record<string, unknown>,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: triggerSeconds,
    },
  });
  return id;
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear badge
 */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

/**
 * Get cached native device push token (APNs/FCM)
 */
export async function getCachedDevicePushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_PUSH_TOKEN_KEY);
  } catch (error) {
    console.warn('Error reading device push token:', error);
    return null;
  }
}

/**
 * Schedule a local notification for a new message (background fallback)
 */
export async function scheduleMessageNotification(message: string): Promise<string> {
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Echo replied',
      body: message.length > 140 ? `${message.slice(0, 137)}...` : message,
      data: {
        type: 'message',
        messageId,
        messageContent: message,
        timestamp: new Date().toISOString(),
      } as unknown as Record<string, unknown>,
      sound: true,
    },
    trigger: null,
  });
}
