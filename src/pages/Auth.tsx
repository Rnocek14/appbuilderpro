import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Flame, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Input, Card } from '../components/ui';

type Mode = 'signin' | 'signup' | 'magic';

export default function Auth() {
  const { session, configured, signIn, signUp, sendMagicLink } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast('error', 'Enter your email address.');
    if (mode !== 'magic' && password.length < 8) return toast('error', 'Password needs at least 8 characters.');
    setBusy(true);
    let err: string | null = null;
    if (mode === 'signin') err = await signIn(email, password);
    if (mode === 'signup') err = await signUp(email, password, fullName.trim());
    if (mode === 'magic') {
      err = await sendMagicLink(email);
      if (!err) setMagicSent(true);
    }
    setBusy(false);
    if (err) toast('error', err);
    else if (mode === 'signup') toast('success', 'Account created. Check your inbox to confirm your email.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <Flame size={20} className="text-forge-ember" />
          <span className="font-display text-lg font-semibold">FableForge</span>
        </div>

        {!configured && (
          <div className="mb-4 rounded-lg border border-forge-warn/40 bg-forge-warn/10 p-3 text-xs text-forge-warn">
            Supabase isn't configured yet. Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code>,
            add your project URL and anon key, then restart the dev server.
          </div>
        )}

        <div className="mb-5 flex rounded-lg border border-forge-border p-0.5 text-xs" role="tablist" aria-label="Sign-in method">
          {([['signin', 'Sign in'], ['signup', 'Create account'], ['magic', 'Magic link']] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setMagicSent(false); }}
              className={`flex-1 rounded-md px-2 py-1.5 ${mode === m ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:text-forge-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {magicSent ? (
          <div className="rounded-lg border border-forge-ok/40 bg-forge-ok/10 p-4 text-center text-sm">
            <Mail size={18} className="mx-auto mb-2 text-forge-ok" />
            Magic link sent to <strong>{email}</strong>. Open it on this device to sign in.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" aria-label="Full name" autoComplete="name" />
            )}
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" autoComplete="email" required />
            {mode !== 'magic' && (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                aria-label="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
            )}
            <Button type="submit" loading={busy} disabled={!configured} className="w-full">
              {mode === 'signin' && 'Sign in'}
              {mode === 'signup' && 'Create account'}
              {mode === 'magic' && 'Send magic link'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
