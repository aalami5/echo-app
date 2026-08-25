/**
 * OpenAI Realtime voice session helpers.
 *
 * The Echo server owns the OpenAI API key. The app sends a WebRTC SDP offer to
 * the authenticated Echo endpoint and receives the OpenAI answer SDP.
 */

import * as NativeWebRTC from 'react-native-webrtc';

const REALTIME_SESSION_PATH = '/patients/voice/realtime/session';

export type RealtimeVoiceModel = 'gpt-realtime-2.1' | string;
export type RealtimeVoiceName = 'marin' | 'cedar' | string;

export interface RealtimeVoiceSessionOptions {
  baseUrl: string;
  token: string;
  offerSdp: string;
  model?: RealtimeVoiceModel;
  voice?: RealtimeVoiceName;
  instructions?: string;
}

export interface RealtimeVoiceSessionResult {
  answerSdp: string;
}

const getGatewayErrorMessage = async (response: Response): Promise<string> => {
  const body = await response.text();
  if (!body.trim()) {
    return `Realtime voice session failed: ${response.status}`;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed.error || parsed.detail || body;
  } catch {
    return body;
  }
};

export async function createRealtimeVoiceSession({
  baseUrl,
  token,
  offerSdp,
  model,
  voice,
  instructions,
}: RealtimeVoiceSessionOptions): Promise<RealtimeVoiceSessionResult> {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (!normalizedBaseUrl) {
    throw new Error('Gateway URL not configured');
  }
  if (!token) {
    throw new Error('Gateway token not configured');
  }
  if (!offerSdp.trim()) {
    throw new Error('Missing WebRTC offer');
  }

  const params = new URLSearchParams();
  if (model) params.set('model', model);
  if (voice) params.set('voice', voice);
  if (instructions) params.set('instructions', instructions);

  const query = params.toString();
  const response = await fetch(
    `${normalizedBaseUrl}${REALTIME_SESSION_PATH}${query ? `?${query}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
        Accept: 'application/sdp',
      },
      body: offerSdp,
    }
  );

  if (!response.ok) {
    throw new Error(await getGatewayErrorMessage(response));
  }

  const answerSdp = await response.text();
  if (!answerSdp.trim().startsWith('v=')) {
    throw new Error('Realtime voice session returned an invalid SDP answer');
  }

  return { answerSdp };
}

export function hasWebRtcRuntime(): boolean {
  const runtime = globalThis as any;
  return Boolean(
    (runtime.RTCPeerConnection && runtime.navigator?.mediaDevices?.getUserMedia) ||
    ((NativeWebRTC as any).RTCPeerConnection && (NativeWebRTC as any).mediaDevices?.getUserMedia)
  );
}

export function getWebRtcRuntime(): {
  RTCPeerConnection: any;
  RTCSessionDescription?: any;
  mediaDevices: { getUserMedia: (constraints: any) => Promise<any> };
  document?: any;
} | null {
  const runtime = globalThis as any;
  if (runtime.RTCPeerConnection && runtime.navigator?.mediaDevices?.getUserMedia) {
    return {
      RTCPeerConnection: runtime.RTCPeerConnection,
      RTCSessionDescription: runtime.RTCSessionDescription,
      mediaDevices: runtime.navigator.mediaDevices,
      document: runtime.document,
    };
  }

  const nativeRuntime = NativeWebRTC as any;
  if (nativeRuntime.RTCPeerConnection && nativeRuntime.mediaDevices?.getUserMedia) {
    return {
      RTCPeerConnection: nativeRuntime.RTCPeerConnection,
      RTCSessionDescription: nativeRuntime.RTCSessionDescription,
      mediaDevices: nativeRuntime.mediaDevices,
    };
  }

  return null;
}
