/**
 * Push Notification Service for Echo App
 * 
 * Features:
 * - Meeting reminders: 15 min, 10 min, 5 min (unless acknowledged)
 * - New message notifications with preview
 * - Daily brief at 6:30 AM
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import Constants from 'expo-constants';
import type { RichCard } from '../../types';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  type: 'meeting_reminder' | 'new_message' | 'message' | 'daily_brief';
  eventId?: string;
  messagePreview?: string;
  messageId?: string;
  messageContent?: string;
  card?: RichCard;
  timestamp?: string;
  minutesBefore?: number;
}

/**
 * Request notification permissions and get push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get the Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    const token = tokenData.data;
    console.log('Push token:', token);
    
    // Store token in Supabase
    await storeDeviceToken(token);
    
    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Store device token in Supabase
 */
async function storeDeviceToken(token: string): Promise<void> {
  try {
    const deviceId = Device.osBuildId || Device.modelId || 'unknown';
    
    const { error } = await supabase
      .from('device_tokens')
      .upsert({
        token,
        device_id: deviceId,
        platform: Platform.OS,
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
 * Acknowledge a meeting reminder (stops further reminders for this event)
 */
export async function acknowledgeMeetingReminder(eventId: string): Promise<void> {
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
      console.error('Error acknowledging reminder:', error);
    } else {
      console.log('Meeting reminder acknowledged:', eventId);
    }
  } catch (error) {
    console.error('Error in acknowledgeMeetingReminder:', error);
  }
}

/**
 * Check if a meeting reminder has been acknowledged
 */
export async function isReminderAcknowledged(eventId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('notification_acks')
      .select('acked_at')
      .eq('event_id', eventId)
      .single();

    if (error || !data) {
      return false;
    }

    // Consider ack valid if it was done today
    const ackDate = new Date(data.acked_at);
    const today = new Date();
    return ackDate.toDateString() === today.toDateString();
  } catch (error) {
    return false;
  }
}

/**
 * Handle notification response (when user taps notification)
 */
export function setupNotificationResponseHandler(
  onMeetingTap: (eventId: string) => void,
  onMessageTap: (messageData: { id: string; content: string; timestamp: string; card?: RichCard } | null) => void,
  onBriefTap: () => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as unknown as NotificationData;
    
    if (data.type === 'meeting_reminder') {
      if (data.eventId) {
        acknowledgeMeetingReminder(data.eventId);
        onMeetingTap(data.eventId);
      }
    } else if (data.messageId && data.messageContent) {
      // Any notification with messageId + messageContent → route to chat
      onMessageTap({
        id: data.messageId,
        content: data.messageContent,
        timestamp: data.timestamp || new Date().toISOString(),
        card: data.card,
      });
    } else {
      // Fallback: still navigate to chat, server sync will pick up the message
      onMessageTap(null);
    }
  });
}

/**
 * Handle incoming notifications while app is foregrounded
 */
export function setupNotificationReceivedHandler(
  onReceive: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(onReceive);
}

/**
 * Schedule a local notification (for testing)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data: NotificationData,
  seconds: number = 5
): Promise<string> {
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data as unknown as Record<string, unknown>,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Get all delivered notifications from notification center
 */
export async function getDeliveredNotifications(): Promise<Notifications.Notification[]> {
  return await Notifications.getPresentedNotificationsAsync();
}

/**
 * Dismiss a specific notification from notification center
 */
export async function dismissNotification(identifier: string): Promise<void> {
  await Notifications.dismissNotificationAsync(identifier);
}
