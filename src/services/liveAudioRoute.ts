import { NativeModules, Platform } from 'react-native';
import { Audio } from 'expo-av';

type EchoAudioSessionModule = {
  forceSpeaker?: () => Promise<boolean>;
  clearSpeakerOverride?: () => Promise<boolean>;
};

const EchoAudioSession = NativeModules.EchoAudioSession as EchoAudioSessionModule | undefined;

export async function prepareLiveVoiceAudioRoute(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
  });

  if (Platform.OS === 'ios' && EchoAudioSession?.forceSpeaker) {
    await EchoAudioSession.forceSpeaker();
  }
}

export async function releaseLiveVoiceAudioRoute(): Promise<void> {
  if (Platform.OS === 'ios' && EchoAudioSession?.clearSpeakerOverride) {
    await EchoAudioSession.clearSpeakerOverride();
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
  });
}
