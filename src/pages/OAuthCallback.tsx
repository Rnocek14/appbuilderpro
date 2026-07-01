// src/pages/OAuthCallback.tsx
// Where providers redirect after OAuth consent. Reads ?code&state, exchanges them server-side (the
// oauth edge fn), then returns to where the user started. The provider + return path are stashed in
// sessionStorage by startOAuth.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConnections } from '../hooks/useConnections';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { finishOAuth } = useConnections();
  const { toast } = useToast();
  const ran = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get('code');
    const state = params.get('state');
    const providerErr = params.get('error_description') || params.get('error');
    let stash: { provider?: string; returnTo?: string } = {};
    try { stash = JSON.parse(sessionStorage.getItem('ff:oauth') || '{}'); } catch { /* ignore */ }
    const returnTo = stash.returnTo || '/settings';
    if (providerErr) { setError(providerErr); return; }
    if (!code || !state || !stash.provider) { setError('Missing OAuth response — start the connection again.'); return; }
    finishOAuth(stash.provider, code, state)
      .then((label) => {
        try { sessionStorage.removeItem('ff:oauth'); } catch { /* ignore */ }
        toast('success', `Connected${label ? ` as ${label}` : ''}.`);
        navigate(returnTo, { replace: true });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Connection failed.'));
  }, [params, finishOAuth, navigate, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      {error ? (
        <div>
          <p className="text-sm font-medium text-forge-err">Couldn’t finish connecting</p>
          <p className="mt-1 max-w-sm text-xs text-forge-dim">{error}</p>
          <a href="/settings" className="mt-3 inline-block text-sm text-forge-ember hover:underline">Back to settings</a>
        </div>
      ) : (
        <Spinner label="Finishing the connection…" />
      )}
    </div>
  );
}
