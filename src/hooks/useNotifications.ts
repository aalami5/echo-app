/**
 * Hook for managing push notifications in Echo app
 * 
 * Build 24: Sync missed notifications on app launch
 * - Checks notification center for delivered but untapped notifications
 * - Adds their message content to chat automatically
 * - No more need to tap each notification to see messages
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler,
  getDeliveredNotifications,
  dismissNotification,
  NotificationData,
} from '../services/notifications';
import { useChatStore } from '../stores/chatStore';

/**
 * Sync missed notifications from notification center into chat
 * Called on app launch and when app comes to foreground
 */
async function syncMissedNotifications(): Promise<number> {
  try {
    const delivered = await getDeliveredNotifications();
    const { messages, addMessage } = useChatStore.getState();
    let syncedCount = 0;
    
    for (const notification of delivered) {
      const data = notification.request.content.data as unknown as NotificationData;
      
      // Only process message notifications with content
      if (data?.type === 'message' && data.messageId && data.messageContent) {
        // Check for duplicates
        const isDuplicate = messages.some((msg) => msg.id === data.messageId);
        
        if (!isDuplicate) {
          console.log('[Notifications] Syncing missed message:', data.messageId);
          addMessage({
            id: data.messageId,
            role: 'assistant',
            content: data.messageContent,
            timestamp: data.timestamp || new Date().toISOString(),
          });
          syncedCount++;
        }
        
        // Dismiss the notification since we've processed it
        await dismissNotification(notification.request.identifier);
      }
    }
    
    if (syncedCount > 0) {
      console.log(`[Notifications] Synced ${syncedCount} missed messages`);
    }
    
    return syncedCount;
  } catch (error) {
    console.error('[Notifications] Error syncing missed notifications:', error);
    return 0;
  }
}

export function useNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const router = useRouter();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
        setIsRegistered(true);
      }
    });
    
    // Sync missed notifications on initial mount (app launch)
    syncMissedNotifications();
    
    // Also sync when app comes back to foreground
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Notifications] App came to foreground, syncing missed notifications');
        syncMissedNotifications();
      }
      appStateRef.current = nextAppState;
    });

    // Handle incoming notifications while app is foregrounded
    notificationListener.current = setupNotificationReceivedHandler((notification) => {
      const data = notification.request.content.data as unknown as NotificationData;
      console.log('[Notifications] Foreground notification received:', data);
      
      // If it's a message notification, add it to chat
      if (data.type === 'message' && data.messageId && data.messageContent) {
        const { messages, addMessage } = useChatStore.getState();
        
        // Check for duplicates
        const isDuplicate = messages.some((msg) => msg.id === data.messageId);
        if (isDuplicate) {
          console.log('[Notifications] Skipping duplicate message:', data.messageId);
          return;
        }
        
        console.log('[Notifications] Adding foreground message to chat:', data.messageId);
        addMessage({
          id: data.messageId,
          role: 'assistant',
          content: data.messageContent,
          timestamp: data.timestamp || new Date().toISOString(),
        });
      }
    });

    // Handle notification taps
    responseListener.current = setupNotificationResponseHandler(
      // Meeting tap - navigate to calendar/meeting details
      (eventId) => {
        console.log('Meeting notification tapped:', eventId);
        // Navigate to home tab which shows calendar
        router.push('/');
      },
      // Message tap - navigate to chat
      (messageData) => {
        console.log('Message notification tapped');
        
        if (messageData) {
          const { messages, addMessage } = useChatStore.getState();
          const isDuplicate = messages.some((msg) => msg.id === messageData.id);
          if (!isDuplicate) {
            addMessage({
              id: messageData.id,
              role: 'assistant',
              content: messageData.content,
              timestamp: messageData.timestamp,
            });
          }
        }
        router.push('/');
      },
      // Brief tap - navigate to home
      () => {
        console.log('Daily brief notification tapped');
        router.push('/');
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      appStateSubscription.remove();
    };
  }, [router]);

  return {
    pushToken,
    isRegistered,
  };
}
