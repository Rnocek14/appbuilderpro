// src/hooks/useProjectSecrets.ts
// Reads the integration secret manifest a generation writes to /supabase/.fableforge/secrets.json
// (Phase 6) and tracks which keys the user has provided. The manifest is the model's declaration of
// every secret its edge functions need — this is what powers the secret-request popup.
//
// STORAGE NOTE (interim): provided values are held in localStorage per project so they survive reloads
// before there's a deploy pipeline. They are NEVER written into the app bundle or a VITE_ var. The
// real home is Supabase Function Secrets — the deploy step (Phase 6c) pushes them there and they should
// be cleared locally afterward. See docs/phase6-backend-tier.md.

import { useCallback, useMemo, useState } from 'react';

export interface RequiredSecret { env: string; service: string; purpose: string }
export interface Integration {
  service?: string; purpose?: string; secrets?: string[];
  edgeFunctions?: { name?: string; purpose?: string }[];
  needsWebhook?: boolean; needsCron?: boolean;
}
interface SecretManifest { secrets?: RequiredSecret[]; integrations?: Integration[] }

export const SECRETS_MANIFEST_PATH = '/supabase/.fableforge/secrets.json';
const storeKey = (projectId: string) => `ff:secrets:${projectId}`;
const deployedKey = (projectId: string) => `ff:secrets-deployed:${projectId}`;

function readStore(projectId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(storeKey(projectId)) || '{}') as Record<string, string>; }
  catch { return {}; }
}
function readDeployed(projectId: string): string[] {
  try { return JSON.parse(localStorage.getItem(deployedKey(projectId)) || '[]') as string[]; }
  catch { return []; }
}

export function useProjectSecrets(projectId: string | undefined, files: { path: string; content: string }[]) {
  const [values, setValues] = useState<Record<string, string>>(() => (projectId ? readStore(projectId) : {}));
  const [deployed, setDeployed] = useState<string[]>(() => (projectId ? readDeployed(projectId) : []));

  const manifest = useMemo<SecretManifest>(() => {
    const f = files.find((x) => x.path === SECRETS_MANIFEST_PATH);
    if (!f) return {};
    try { return JSON.parse(f.content) as SecretManifest; } catch { return {}; }
  }, [files]);

  const required = useMemo<RequiredSecret[]>(
    () => (Array.isArray(manifest.secrets) ? manifest.secrets.filter((s) => s && typeof s.env === 'string') : []),
    [manifest],
  );
  const integrations = useMemo<Integration[]>(
    () => (Array.isArray(manifest.integrations) ? manifest.integrations : []),
    [manifest],
  );

  // A secret counts as satisfied if its value is held locally OR it's already been deployed to the server.
  const missing = useMemo(
    () => required.filter((s) => !values[s.env]?.trim() && !deployed.includes(s.env)),
    [required, values, deployed],
  );

  const setSecret = useCallback((env: string, value: string) => {
    if (!projectId) return;
    setValues((prev) => {
      const next = { ...prev };
      if (value.trim()) next[env] = value.trim(); else delete next[env];
      try { localStorage.setItem(storeKey(projectId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [projectId]);

  // After a successful deploy the keys live in Supabase Function Secrets — drop the raw local copies
  // (don't keep plaintext third-party keys in localStorage) and remember they're deployed.
  const markDeployed = useCallback((envs: string[]) => {
    if (!projectId || !envs.length) return;
    setDeployed((prev) => {
      const next = [...new Set([...prev, ...envs])];
      try { localStorage.setItem(deployedKey(projectId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setValues((prev) => {
      const next = { ...prev };
      for (const e of envs) delete next[e];
      try { localStorage.setItem(storeKey(projectId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [projectId]);

  return { required, integrations, missing, values, deployed, setSecret, markDeployed };
}
