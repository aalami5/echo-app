/**
 * Timezone Store
 *
 * Tracks device timezone and detects when user is traveling.
 * Updates on app foreground and store hydration.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { getDeviceTimezone, getTimezoneState, HOME_TIMEZONE } from '../services/timezone';

interface TimezoneStore {
  deviceTimezone: string;
  homeTimezone: string;
  isTraveling: boolean;
  lastChecked: number;
  updateTimezone: () => void;
}

export const useTimezoneStore = create<TimezoneStore>()(
  persist(
    (set) => ({
      deviceTimezone: getDeviceTimezone(),
      homeTimezone: HOME_TIMEZONE,
      isTraveling: false,
      lastChecked: Date.now(),

      updateTimezone: () => {
        const state = getTimezoneState();
        set({
          deviceTimezone: state.deviceTimezone,
          homeTimezone: state.homeTimezone,
          isTraveling: state.isTraveling,
          lastChecked: Date.now(),
        });
      },
    }),
    {
      name: 'echo-timezone',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        deviceTimezone: state.deviceTimezone,
        homeTimezone: state.homeTimezone,
        isTraveling: state.isTraveling,
        lastChecked: state.lastChecked,
      }),
    }
  )
);

// Update timezone when app comes to foreground
function handleAppStateChange(nextState: AppStateStatus) {
  if (nextState === 'active') {
    useTimezoneStore.getState().updateTimezone();
  }
}

AppState.addEventListener('change', handleAppStateChange);

// Initialize on import
useTimezoneStore.getState().updateTimezone();
