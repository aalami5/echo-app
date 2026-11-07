import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { acknowledgeMeetingNotification, registerForPushNotifications } from '../services/notifications';
import { linkedBriefId, OPENED_BRIEF_KEY } from '../services/briefNotification';
import { notificationInbox, readLinkedMessage, syncGatewayNotifications } from '../services/gatewayChat';
export function useNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null), [isRegistered, setIsRegistered] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const receive = async (notification: Notifications.Notification, open = false) => {
      const data = notification.request.content.data, linked = linkedBriefId(data);
      if (open && alive) router.push({ pathname: '/chat', params: linked ? { briefMessageId: linked } : typeof data.messageId === 'string' ? { notificationMessageId: data.messageId } : {} });
      if (linked) {
        await notificationInbox.put(await readLinkedMessage(linked));
      } else {
        // APNs previews may be truncated. Fetch and save the full server body.
        // No legacy cache hydration, no acknowledgement before durable saving.
        await syncGatewayNotifications();
      }
      if (open && data.type === 'meeting' && typeof data.eventId === 'string') await acknowledgeMeetingNotification(data.eventId);
      if (linked || (typeof data.messageId === 'string' && await notificationInbox.get(data.messageId))) await Notifications.dismissNotificationAsync(notification.request.identifier);
    };
    const recover = async () => {
      await syncGatewayNotifications().catch(() => {});
      for (const item of await Notifications.getPresentedNotificationsAsync()) await receive(item).catch(() => {});
    };
    void registerForPushNotifications().then(token => { if (alive && token) { setPushToken(token); setIsRegistered(true); } });
    void Notifications.getLastNotificationResponseAsync().then(async response => {
      if (!response) return;
      const id = linkedBriefId(response.notification.request.content.data);
      if (!id || await AsyncStorage.getItem(OPENED_BRIEF_KEY) !== id) await receive(response.notification, true);
    }).catch(() => {});
    void recover().catch(() => {});
    const received = Notifications.addNotificationReceivedListener(n => { void receive(n).catch(() => {}); });
    const tapped = Notifications.addNotificationResponseReceivedListener(r => { void receive(r.notification, true).catch(() => {}); });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void recover().catch(() => {}); });
    return () => { alive = false; received.remove(); tapped.remove(); foreground.remove(); };
  }, [router]);
  return { pushToken, isRegistered };
}
