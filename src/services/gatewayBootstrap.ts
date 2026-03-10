/**
 * Gateway Bootstrap — fetches gateway config from Supabase RPC
 * after the user authenticates.
 */

import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../stores/settingsStore';

export async function bootstrapGatewayConfig(): Promise<{ url: string; token: string } | null> {
  const { data, error } = await supabase.rpc('get_gateway_config');

  if (error) {
    console.error('[GatewayBootstrap] RPC error:', error.message);
    return null;
  }

  if (!data?.gateway_url || !data?.gateway_token) {
    console.error('[GatewayBootstrap] Invalid response:', data);
    return null;
  }

  return { url: data.gateway_url, token: data.gateway_token };
}

export async function ensureGatewayConfig(): Promise<boolean> {
  const { gatewayToken } = useSettingsStore.getState();
  if (gatewayToken) {
    return true;
  }

  const config = await bootstrapGatewayConfig();
  if (!config) {
    return false;
  }

  useSettingsStore.getState().setGatewayUrl(config.url);
  useSettingsStore.getState().setGatewayToken(config.token);
  console.log('[GatewayBootstrap] Gateway config applied');
  return true;
}
