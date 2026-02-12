/**
 * Background task helpers for Gateway requests.
 *
 * Uses Expo Background Fetch + Task Manager to finish pending requests
 * when the app is backgrounded.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { GatewayService } from './gateway';
import { useSettingsStore } from '../stores/settingsStore';
import { scheduleMessageNotification } from './notifications';

const GATEWAY_TASK_NAME = 'gateway-send-background-task';
const PENDING_REQUESTS_KEY = 'gateway_pending_requests';
const PENDING_RESPONSES_KEY = 'gateway_pending_responses';

export interface PendingGatewayRequest {
  id: string;
  content: string;
  createdAt: string;
  retryCount: number;
}

export interface PendingGatewayResponse {
  requestId: string;
  content: string;
  createdAt: string;
}

const loadJSON = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[GatewayBackground] Failed to load', key, error);
    return fallback;
  }
};

const saveJSON = async <T>(key: string, value: T): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[GatewayBackground] Failed to save', key, error);
  }
};

export async function registerGatewayBackgroundTask(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
      console.log('[GatewayBackground] Background fetch unavailable:', status);
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(GATEWAY_TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(GATEWAY_TASK_NAME, {
        minimumInterval: 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
    return true;
  } catch (error) {
    console.error('[GatewayBackground] Failed to register background task:', error);
    return false;
  }
}

export async function enqueuePendingGatewayRequest(request: PendingGatewayRequest): Promise<void> {
  const existing = await loadJSON<PendingGatewayRequest[]>(PENDING_REQUESTS_KEY, []);
  const hasRequest = existing.some((item) => item.id === request.id);
  if (!hasRequest) {
    await saveJSON(PENDING_REQUESTS_KEY, [...existing, request]);
  }
}

export async function removePendingGatewayRequest(requestId: string): Promise<void> {
  const existing = await loadJSON<PendingGatewayRequest[]>(PENDING_REQUESTS_KEY, []);
  const next = existing.filter((item) => item.id !== requestId);
  await saveJSON(PENDING_REQUESTS_KEY, next);
}

export async function listPendingGatewayRequests(): Promise<PendingGatewayRequest[]> {
  return await loadJSON<PendingGatewayRequest[]>(PENDING_REQUESTS_KEY, []);
}

export async function addPendingGatewayResponse(response: PendingGatewayResponse): Promise<void> {
  const existing = await loadJSON<PendingGatewayResponse[]>(PENDING_RESPONSES_KEY, []);
  await saveJSON(PENDING_RESPONSES_KEY, [...existing, response]);
}

export async function drainPendingGatewayResponses(): Promise<PendingGatewayResponse[]> {
  const existing = await loadJSON<PendingGatewayResponse[]>(PENDING_RESPONSES_KEY, []);
  if (existing.length > 0) {
    await saveJSON(PENDING_RESPONSES_KEY, []);
  }
  return existing;
}

export async function processPendingGatewayRequests(): Promise<PendingGatewayResponse[]> {
  const pending = await loadJSON<PendingGatewayRequest[]>(PENDING_REQUESTS_KEY, []);
  if (pending.length === 0) return [];

  if (!useSettingsStore.persist.hasHydrated()) {
    await useSettingsStore.persist.rehydrate();
  }

  const { gatewayUrl, gatewayToken } = useSettingsStore.getState();
  if (!gatewayUrl || !gatewayToken) {
    console.log('[GatewayBackground] Missing gateway credentials.');
    return [];
  }

  const service = new GatewayService({
    baseUrl: gatewayUrl,
    token: gatewayToken,
    userId: 'echo-app-oliver',
  });

  const responses: PendingGatewayResponse[] = [];
  const nextQueue = [...pending];

  for (const request of pending) {
    try {
      const response = await service.sendMessage(request.content);
      const responseEntry: PendingGatewayResponse = {
        requestId: request.id,
        content: response,
        createdAt: new Date().toISOString(),
      };
      responses.push(responseEntry);
      await addPendingGatewayResponse(responseEntry);
      const index = nextQueue.findIndex((item) => item.id === request.id);
      if (index >= 0) {
        nextQueue.splice(index, 1);
      }
      if (AppState.currentState !== 'active') {
        await scheduleMessageNotification(response);
      }
    } catch (error) {
      const index = nextQueue.findIndex((item) => item.id === request.id);
      if (index >= 0) {
        nextQueue[index] = {
          ...request,
          retryCount: request.retryCount + 1,
        };
      }
      console.warn('[GatewayBackground] Request failed, will retry:', error);
    }
  }

  await saveJSON(PENDING_REQUESTS_KEY, nextQueue);
  return responses;
}

TaskManager.defineTask(GATEWAY_TASK_NAME, async () => {
  const responses = await processPendingGatewayRequests();
  if (responses.length > 0) {
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }
  return BackgroundFetch.BackgroundFetchResult.NoData;
});
