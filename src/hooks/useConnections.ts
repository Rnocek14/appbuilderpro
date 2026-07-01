// src/hooks/useConnections.ts
// Reads/writes the user's provider connections through the `connections` edge function. Tokens live
// server-side (provider_connections table); this hook only ever sees sanitized status — never a token.
// Replaces the per-project localStorage tokens with a connect-once-per-account model.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Connection { provider: string; accountLabel: string | null; connected: boolean; expiresAt: string | null }

// supabase-js reports non-2xx as a generic "Edge Function returned a non-2xx status code". Pull the
// actual { error } message out of the response body so the user sees the real reason.
export async function fnError(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: { json?: () => Promise<{ error?: string }> } };
  try { const body = await e.context?.json?.(); if (body?.error) return body.error; } catch { /* ignore */ }
  return e?.message ?? 'Request failed.';
}

export function useConnections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke<{ connections?: Connection[] }>('connections', { body: { action: 'list' } });
      setConnections(data?.connections ?? []);
    } catch { /* not deployed / offline — show as none connected */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const connect = useCallback(async (provider: string, token: string): Promise<string | undefined> => {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; label?: string }>(
      'connections', { body: { action: 'connect', provider, token } });
    if (error) throw new Error(await fnError(error));
    if (data?.error) throw new Error(data.error);
    await refresh();
    return data?.label;
  }, [refresh]);

  // Begin an OAuth connect: get the provider authorize URL and redirect the browser to it.
  const startOAuth = useCallback(async (provider: string, returnTo = '/settings') => {
    const redirectUri = window.location.origin + '/oauth/callback';
    const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>('oauth', { body: { action: 'start', provider, redirectUri } });
    if (error) throw new Error(await fnError(error));
    if (data?.error) throw new Error(data.error);
    if (!data?.url) throw new Error('No authorize URL returned.');
    try { sessionStorage.setItem('ff:oauth', JSON.stringify({ provider, returnTo })); } catch { /* ignore */ }
    window.location.href = data.url;
  }, []);

  // Finish an OAuth connect (called from /oauth/callback) — exchange the code for tokens server-side.
  const finishOAuth = useCallback(async (provider: string, code: string, state: string): Promise<string | undefined> => {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; label?: string }>('oauth', { body: { action: 'exchange', provider, code, state } });
    if (error) throw new Error(await fnError(error));
    if (data?.error) throw new Error(data.error);
    await refresh();
    return data?.label;
  }, [refresh]);

  const disconnect = useCallback(async (provider: string) => {
    await supabase.functions.invoke('connections', { body: { action: 'disconnect', provider } });
    await refresh();
  }, [refresh]);

  const isConnected = useCallback((provider: string) => connections.some((c) => c.provider === provider && c.connected), [connections]);
  const labelFor = useCallback((provider: string) => connections.find((c) => c.provider === provider)?.accountLabel ?? null, [connections]);

  return { connections, loading, refresh, connect, startOAuth, finishOAuth, disconnect, isConnected, labelFor };
}
