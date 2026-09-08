/**
 * Gateway Bootstrap — fetches gateway config from Supabase RPC
 * after the user authenticates.
 */

import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../stores/settingsStore';

export async function bootstrapGatewayConfig(): Promise<{
  url: string;
  token: string;
  openaiApiKey?: string;
  elevenlabsApiKey?: string;
} | null> {
  const { data, error } = await supabase.rpc('get_gateway_config');

  if (error) {
    console.error('[GatewayBootstrap] RPC error:', error.message);
    return null;
  }

  if (!data?.gateway_url || !data?.gateway_token) {
    console.error('[GatewayBootstrap] Invalid response:', data);
    return null;
  }

  return {
    url: data.gateway_url,
    token: data.gateway_token,
    openaiApiKey: data.openai_api_key ?? undefined,
    elevenlabsApiKey: data.elevenlabs_api_key ?? undefined,
  };
}

export async function ensureGatewayConfig(forceRefresh = false): Promise<boolean> {
  const { gatewayToken } = useSettingsStore.getState();
  if (gatewayToken && !forceRefresh) {
    return true;
  }

  const config = await bootstrapGatewayConfig();
  if (!config) {
    return false;
  }

  const settings = useSettingsStore.getState();
  settings.setGatewayUrl(config.url);
  settings.setGatewayToken(config.token);

  if (config.openaiApiKey && !settings.openaiApiKey) {
    settings.setOpenAIKey(config.openaiApiKey);
  }
  if (config.elevenlabsApiKey && !settings.elevenlabsApiKey) {
    settings.setElevenLabsKey(config.elevenlabsApiKey);
  }

  console.log('[GatewayBootstrap] Gateway config applied');
  return true;
}

/**
 * Fetch the current server-owned gateway credentials and replace any cached
 * values. Use this after an authentication rejection so a rotated token does
 * not remain stuck in SecureStore indefinitely.
 */
export async function refreshGatewayConfig(): Promise<{
  url: string;
  token: string;
} | null> {
  const config = await bootstrapGatewayConfig();
  if (!config) {
    return null;
  }

  const settings = useSettingsStore.getState();
  settings.setGatewayUrl(config.url);
  settings.setGatewayToken(config.token);

  if (config.openaiApiKey) {
    settings.setOpenAIKey(config.openaiApiKey);
  }
  if (config.elevenlabsApiKey) {
    settings.setElevenLabsKey(config.elevenlabsApiKey);
  }

  console.log('[GatewayBootstrap] Gateway config refreshed');
  return { url: config.url, token: config.token };
}
