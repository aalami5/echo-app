/**
 * Hook for managing push notifications in Echo app
 * 
 * Build 17: Queue notifications until gateway connected
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler,
  NotificationData,
} from '../services/notifications';
import { useChatStore } from '../stores/chatStore';
import { useConnectionStore } from '../stores/connectionStore';

export function useNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const router = useRouter();
  
  // Process queued notifications when connected
  const processQueuedNotifications = useCallback(() => {
    const { state, drainNotifications } = useConnectionStore.getState();
    if (state !== 'connected') return;
    
    const pending = drainNotifications();
    const { messages, addMessage } = useChatStore.getState();
    
    for (const notification of pending) {
      if (notification.type === 'message' && notification.content) {
        const isDuplicate = messages.some((msg) => msg.id === notification.id);
        if (!isDuplicate) {
          console.log('[Notifications] Processing queued message:', notification.id);
          addMessage({
            id: notification.id,
            role: 'assistant',
            content: notification.content,
            timestamp: notification.timestamp,
          });
        }
      }
      // Meeting/brief notifications just navigate, no special handling needed
    }
  }, []);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
        setIsRegistered(true);
      }
    });

    // Handle incoming notifications while app is foregrounded
    // Build 18: Actually add messages to chat when received in foreground
    notificationListener.current = setupNotificationReceivedHandler((notification) => {
      const data = notification.request.content.data as unknown as NotificationData;
      console.log('[Notifications] Foreground notification received:', data);
      
      // If it's a message notification, add it to chat
      if (data.type === 'message' && data.messageId && data.messageContent) {
        const { state, queueNotification } = useConnectionStore.getState();
        const { messages, addMessage } = useChatStore.getState();
        
        // Check for duplicates
        const isDuplicate = messages.some((msg) => msg.id === data.messageId);
        if (isDuplicate) {
          console.log('[Notifications] Skipping duplicate message:', data.messageId);
          return;
        }
        
        if (state === 'connected') {
          // Connected - add immediately to chat
          console.log('[Notifications] Adding foreground message to chat:', data.messageId);
          addMessage({
            id: data.messageId,
            role: 'assistant',
            content: data.messageContent,
            timestamp: data.timestamp || new Date().toISOString(),
          });
        } else {
          // Not connected - queue for later
          console.log('[Notifications] Queuing foreground notification (not connected)');
          queueNotification({
            id: data.messageId,
            type: 'message',
            content: data.messageContent,
            timestamp: data.timestamp || new Date().toISOString(),
          });
        }
      }
    });

    // Handle notification taps
    responseListener.current = setupNotificationResponseHandler(
      // Meeting tap - navigate to calendar/meeting details
      (eventId) => {
        console.log('Meeting notification tapped:', eventId);
        
        // Queue if not connected
        const { state, queueNotification } = useConnectionStore.getState();
        if (state !== 'connected') {
          queueNotification({
            id: `meeting-${eventId}`,
            type: 'meeting',
            eventId,
            timestamp: new Date().toISOString(),
          });
        }
        
        // Navigate to home tab which shows calendar
        router.push('/');
      },
      // Message tap - navigate to chat
      (messageData) => {
        console.log('Message notification tapped');
        
        const { state, queueNotification } = useConnectionStore.getState();
        
        if (messageData) {
          // If not connected, queue the notification
          if (state !== 'connected') {
            console.log('[Notifications] Queuing message notification (not connected)');
            queueNotification({
              id: messageData.id,
              type: 'message',
              content: messageData.content,
              timestamp: messageData.timestamp,
            });
          } else {
            // Connected - add immediately
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
    };
  }, [router]);

  // Watch for connection state changes and process queue
  useEffect(() => {
    const unsubscribe = useConnectionStore.subscribe((state) => {
      if (state.state === 'connected') {
        processQueuedNotifications();
      }
    });
    
    return unsubscribe;
  }, [processQueuedNotifications]);

  return {
    pushToken,
    isRegistered,
    processQueuedNotifications,
  };
}
