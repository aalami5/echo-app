/**
 * Hook for managing push notifications in Echo app
 * 
 * Build 24: Sync missed notifications on app launch
 * Build 25: Server-side message sync for reliability
 * - Primary: Fetch pending messages from server on launch/foreground
 * - Fallback: Check notification center for delivered notifications
 * - Messages auto-appear in chat without tapping each notification
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
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Sync missed notifications from notification center into chat
 * Called on app launch and when app comes to foreground
 */
async function syncMissedNotifications(retryCount: number = 0): Promise<number> {
  try {
    const delivered = await getDeliveredNotifications();
    console.log(`[Notifications] getPresentedNotificationsAsync returned ${delivered.length} notifications (retry: ${retryCount})`);
    
    // Debug: log all delivered notifications
    for (const n of delivered) {
      console.log('[Notifications] Delivered notification:', JSON.stringify({
        identifier: n.request.identifier,
        title: n.request.content.title,
        body: n.request.content.body?.substring(0, 50),
        data: n.request.content.data,
      }));
    }
    
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
        } else {
          console.log('[Notifications] Skipping duplicate:', data.messageId);
        }
        
        // Dismiss the notification since we've processed it
        await dismissNotification(notification.request.identifier);
      }
    }
    
    if (syncedCount > 0) {
      console.log(`[Notifications] Synced ${syncedCount} missed messages`);
    }
    
    // Retry once after short delay if no notifications found (iOS timing issue)
    if (delivered.length === 0 && retryCount === 0) {
      console.log('[Notifications] No notifications found, scheduling retry in 500ms...');
      setTimeout(() => syncMissedNotifications(1), 500);
    }
    
    return syncedCount;
  } catch (error) {
    console.error('[Notifications] Error syncing missed notifications:', error);
    return 0;
  }
}

/**
 * Sync missed messages from server (more reliable than notification center)
 * This fetches messages that were sent while app was backgrounded
 */
async function syncMessagesFromServer(): Promise<number> {
  try {
    const { gatewayUrl, gatewayToken } = useSettingsStore.getState();
    
    if (!gatewayUrl || !gatewayToken) {
      console.log('[Notifications] No gateway configured, skipping server sync');
      return 0;
    }
    
    // The sync server runs on port 18790 (same host as gateway on 18789)
    const syncUrl = gatewayUrl.replace(':18789', ':18790');
    
    console.log('[Notifications] Fetching pending messages from server...');
    const response = await fetch(`${syncUrl}/messages/pending`, {
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
      },
    });
    
    if (!response.ok) {
      console.error('[Notifications] Server sync failed:', response.status);
      return 0;
    }
    
    const data = await response.json();
    const { messages, addMessage } = useChatStore.getState();
    const messageIdsToAck: string[] = [];
    let syncedCount = 0;
    
    console.log(`[Notifications] Server returned ${data.count} pending messages`);
    
    for (const msg of data.messages) {
      // Check for duplicates
      const isDuplicate = messages.some((m) => m.id === msg.id);
      
      if (!isDuplicate && msg.content) {
        console.log('[Notifications] Syncing server message:', msg.id);
        addMessage({
          id: msg.id,
          role: 'assistant',
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
        });
        syncedCount++;
      }
      
      // Always acknowledge (even if duplicate, to clear server queue)
      messageIdsToAck.push(msg.id);
    }
    
    // Acknowledge messages on server
    if (messageIdsToAck.length > 0) {
      console.log(`[Notifications] Acknowledging ${messageIdsToAck.length} messages on server`);
      await fetch(`${syncUrl}/messages/ack`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gatewayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: messageIdsToAck }),
      });
    }
    
    if (syncedCount > 0) {
      console.log(`[Notifications] Synced ${syncedCount} messages from server`);
    }
    
    return syncedCount;
  } catch (error) {
    console.error('[Notifications] Error syncing from server:', error);
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
    
    // Sync missed messages on initial mount (app launch)
    // Try both notification center AND server sync for reliability
    syncMissedNotifications();
    syncMessagesFromServer();
    
    // Also sync when app comes back to foreground
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Notifications] App came to foreground, syncing missed messages');
        syncMissedNotifications();
        syncMessagesFromServer();
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
