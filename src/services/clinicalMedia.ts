import { useSettingsStore } from '../stores/settingsStore';
import { ensureGatewayConfig, refreshGatewayConfig } from './gatewayBootstrap';

// Provider keys stay on the server. Refresh app authentication once, not forever.
export async function clinicalMediaRequest(path: '/scan' | '/transcribe', body: () => BodyInit, json = false): Promise<any> {
  if (!await ensureGatewayConfig()) throw new Error('Connect Echo in Settings before scanning or dictating.');
  for (let attempt=0; attempt<2; attempt++) {
    const {gatewayUrl,gatewayToken}=useSettingsStore.getState();
    if (!gatewayUrl || !gatewayToken) throw new Error('Connect Echo in Settings before scanning or dictating.');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),100000);
    let response: Response;
    try {
      response=await fetch(`${gatewayUrl.replace(/\/+$/,'')}/patients/media${path}`,{method:'POST',headers:{Authorization:`Bearer ${gatewayToken}`,...(json ? {'Content-Type':'application/json'} : {})},body:body(),signal:controller.signal});
      if (response.status===401 || response.status===403) {
        if (attempt===0 && await refreshGatewayConfig()) continue;
        throw new Error('Echo could not reconnect. Check your connection in Settings and try again.');
      }
      const result=await response.json().catch(()=>null);
      if (!response.ok) throw new Error(typeof result?.error==='string' ? result.error : 'Processing is temporarily unavailable. Please try again.');
      if (!result) throw new Error('Processing returned an unreadable response. Please try again.');
      return result;
    } catch(error) {
      if (controller.signal.aborted) throw new Error('Processing took too long. Please try again.');
      if (error instanceof TypeError) throw new Error('Cannot reach Echo. Check your internet connection and try again.');
      throw error;
    } finally {clearTimeout(timer);}
  }
}
