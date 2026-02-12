/**
 * Hook for managing push notifications in Echo app
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler,
  NotificationData,
} from '../services/notifications';
import { useChatStore } from '../stores/chatStore';

export function useNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
        setIsRegistered(true);
      }
    });

    // Handle incoming notifications while app is foregrounded
    notificationListener.current = setupNotificationReceivedHandler((notification) => {
      const data = notification.request.content.data as unknown as NotificationData;
      console.log('Notification received:', data);
      // Could show an in-app toast here
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
    };
  }, [router]);

  return {
    pushToken,
    isRegistered,
  };
}
