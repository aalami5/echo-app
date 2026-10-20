import { Alert } from 'react-native';
import { liveVoiceSession } from '../hooks/useRealtimeVoice';
import { claimClinicalAudio, releaseClinicalAudio } from './audioOwnership';
export async function beginClinicalAudio(owner: object): Promise<boolean> {
  // Reserve first, including while confirmation is open, to close the start/start race.
  claimClinicalAudio(owner);
  const state = liveVoiceSession.getSnapshot().status;
  if (['idle', 'unsupported', 'error'].includes(state)) return true;
  const confirmed = await new Promise<boolean>(resolve => Alert.alert('End Live Voice to dictate?',
    'Patient dictation stays separate from your personal conversation.',
    [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
     { text: 'End call and dictate', onPress: () => resolve(true) }], { cancelable: false }));
  if (!confirmed) { releaseClinicalAudio(owner); return false; }
  await liveVoiceSession.stop();
  return true;
}
