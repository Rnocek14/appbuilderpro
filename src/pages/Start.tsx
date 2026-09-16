// src/pages/Start.tsx  (/garvis/start)
// START HERE — the one page that turns the machine on, written for someone who has never opened a
// terminal.
//
// WHY IT EXISTS: the platform survey (docs/platform-capability-map.md) found 219 capabilities, three
// of which decide whether ANY of the rest does anything — the AI key, the app's own address, and the
// worker password. None of them had a field anywhere in the app. They could only be typed into the
// Supabase dashboard from a command line, so the owner pressed the one button on the one daily-loop
// page, got "ANTHROPIC_API_KEY is not set", and had no way forward. Five other screens each showed a
// PART of this truth and disagreed with each other about what "ready" meant.
//
// This page is the whole truth in one place, in the order that unlocks things, and every step can be
// finished here. It is a sequence, so it is numbered like one: each step says what it switches on and
// what stays dark until it is done.
//
// The one paste that makes it possible is step 1 — a Supabase personal access token, copied from a
// web page, no terminal. After that the app writes its own keys through the Management API (the same
// call deploy-backend has always used), so steps 2-4 are just fields.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, ExternalLink, Loader2, Lock, Radio, Sparkles, Radar, MailCheck, KeyRound,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Input, Skeleton } from '../components/ui';
import { useToast } from '../context/ToastContext';
import {
  fetchSystemStatus, setSecret, supabaseConnected, connectSupabase, armHeartbeat,
  type SystemStatus,
} from '../lib/garvis/systemControl';
import { fetchHuntReadiness } from '../lib/garvis/huntReadinessRun';
import { publicOriginProblem } from '../../supabase/functions/_shared/appOriginCore';
import type { Readiness } from '../lib/garvis/huntReadiness';

/** A key, described by what it switches on rather than by its variable name.
 *
 *  The labels used to BE the variable names in title case — "Claude API key", "Worker password",
 *  "Resend API key". Those are what the machine calls them. `label` now says what the thing does,
 *  and `vendor` carries the name you'll actually see on the page you copy it from, which is the
 *  only reason the machine's name is worth showing at all. */
interface KeyDef {
  env: string;
  label: string;
  /** What this value is called where you go to get it — so the label can be plain English without
   *  sending the owner hunting for something nobody's website calls by that name. */
  vendor?: string;
  /** What stays dark without it — in the owner's words, not the system's. */
  dark: string;
  where: { text: string; url: string } | null;
  placeholder: string;
  /** Two or three words naming what the button saves, so five save buttons on one page do not all
   *  read "Save". Reads as "Save the key", "Save the address". */
  noun: string;
  /** Explicit, because it decides whether a step counts as finished. It used to be inferred from
   *  the word "optional" appearing in the label, which meant rewording a label silently made an
   *  optional key required and the step un-completable. */
  optional?: boolean;
  /** Some keys have a sensible value we can offer, so the owner does not have to invent one. The
   *  button says what it will do, not "Suggest". */
  suggest?: { label: string; value: () => string };
}

/** A random, strong shared password. The owner should never have to invent one, and inventing a weak
 *  one is worse than not having it: the clock can read all-green while every job is silently rejected. */
function strongSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface StepDef {
  n: number;
  title: string;
  /** One sentence: what this step switches on. */
  unlocks: string;
  icon: typeof Sparkles;
  keys: KeyDef[];
}

const STEPS: StepDef[] = [
  {
    n: 2,
    title: 'Switch on the writing',
    unlocks: 'Every draft, every generated website, every script — written for your business instead of from a generic template.',
    icon: Sparkles,
    keys: [
      {
        env: 'ANTHROPIC_API_KEY',
        noun: "the key",
        label: 'The key that lets Claude write for you',
        vendor: 'Anthropic calls this an API key',
        dark: 'Searching for businesses, building their sites and writing anything all stop before they start. This is the one that makes the first button work.',
        where: { text: 'Get one from the Anthropic console', url: 'https://console.anthropic.com/settings/keys' },
        placeholder: 'sk-ant-…',
      },
    ],
  },
  {
    n: 3,
    title: 'Switch on finding businesses',
    unlocks: 'Searching for local businesses, opening their sites, building each a demo, and putting a real link in the pitch.',
    icon: Radar,
    keys: [
      {
        env: 'APP_ORIGIN',
        noun: "the address",
        label: 'This app’s own web address',
        dark: 'Sites still get built, and the email that should show them off is never written — silently. This is the quiet one that makes the app look broken.',
        where: null,
        placeholder: 'https://your-app.example.com',
        // OFFERED ONLY WHEN IT IS USABLE. This button read "Use the address I'm on", which on a
        // laptop is http://localhost:5173 — an address that makes every readiness light go green
        // while mailing a dead link to a real business. Running locally there is no honest
        // suggestion to make, so none is offered and the field explains why.
        suggest: publicOriginProblem(typeof window === 'undefined' ? '' : window.location.origin)
          ? undefined
          : { label: 'Use the address I am on', value: () => window.location.origin },
      },
      {
        env: 'WORKER_SECRET',
        noun: "the password",
        label: 'A password the app uses to talk to itself',
        dark: 'Reading a business’s site and finding their email fails without a word, so every one of them ends “no email found”. Nothing runs on a schedule either.',
        where: null,
        placeholder: 'press the button — any long random string',
        suggest: { label: 'Make one up for me', value: strongSecret },
      },
      {
        env: 'GOOGLE_PLACES_API_KEY',
        noun: "Google's key",
        label: 'Google’s business listings',
        vendor: 'Google calls this a Places API key',
        optional: true,
        dark: 'Nothing. Claude finds businesses on its own. Add this only if you want Google’s listings as well.',
        where: { text: 'Google Cloud console', url: 'https://console.cloud.google.com/apis/credentials' },
        placeholder: 'AIza…',
      },
    ],
  },
  {
    n: 4,
    title: 'Switch on sending email',
    unlocks: 'Approved pitches actually leave, and replies come back onto the business’s row.',
    icon: MailCheck,
    keys: [
      {
        env: 'RESEND_API_KEY',
        noun: "the sending key",
        label: 'The key that actually sends your email',
        vendor: 'Resend calls this an API key',
        dark: 'Every email you approve sits in the Queue forever. Nothing leaves.',
        where: { text: 'Get one from Resend', url: 'https://resend.com/api-keys' },
        placeholder: 're_…',
      },
    ],
  },
];

export default function Start() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null | 'error'>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [token, setToken] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, conn] = await Promise.all([fetchSystemStatus(), supabaseConnected()]);
      setStatus(st);
      setConnected(conn);
    } catch {
      setStatus('error');
      setConnected(false);
    }
    fetchHuntReadiness().then(setReadiness).catch(() => setReadiness(null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isSet = useCallback((env: string): boolean => {
    if (justSaved[env]) return true;   // saved a moment ago; the server light lags a minute
    if (status === null || status === 'error') return false;
    return status.secrets.some((s) => s.name === env && s.set);
  }, [status, justSaved]);

  const clockRunning = useMemo(() => {
    if (status === null || status === 'error') return false;
    return status.cron.some((c) => c.active);
  }, [status]);

  const doConnect = async () => {
    setBusy(true);
    try {
      const label = await connectSupabase(token.trim());
      setToken('');
      setConnected(true);
      toast('success', `Connected to ${label}. Every key below can now be saved from this page.`);
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : "That token didn't work — check you copied all of it.");
    } finally { setBusy(false); }
  };

  const save = async (k: KeyDef) => {
    const v = (values[k.env] ?? '').trim();
    if (!v) { toast('info', `Paste the ${k.label} first.`); return; }
    // Caught here as well as server-side, so the answer is instant and the wording is identical.
    if (k.env === 'APP_ORIGIN') {
      const problem = publicOriginProblem(v);
      if (problem) { toast('error', problem); return; }
    }
    setSaving(k.env);
    try {
      const { note } = await setSecret(k.env, v);
      setValues((s) => ({ ...s, [k.env]: '' }));
      setJustSaved((s) => ({ ...s, [k.env]: true }));
      toast('success', `${k.label} saved. ${note}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : `${k.label} didn't save — try again.`);
    } finally { setSaving(null); }
  };

  const arm = async () => {
    const secret = (values.WORKER_SECRET ?? '').trim();
    if (!isSet('WORKER_SECRET')) {
      toast('info', 'Do step 3 first — the clock uses the same password the app uses to talk to itself.');
      return;
    }
    if (!secret) {
      toast('info', 'Paste the SAME password you saved in step 3. If the two differ, every job is turned away without a word.');
      return;
    }
    setBusy(true);
    try {
      const base = `${(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`;
      const res = await armHeartbeat(base, secret);
      toast('success', `The clock is running — ${res}`);
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : "The clock didn't start — check the password matches step 3.");
    } finally { setBusy(false); }
  };

  const stepDone = (step: StepDef): boolean =>
    step.keys.filter((k) => !k.optional).every((k) => isSet(k.env));

  const doneCount = (connected ? 1 : 0) + STEPS.filter(stepDone).length + (clockRunning ? 1 : 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-wide text-forge-ember">Start here</p>
          <h1 className="mt-1 text-2xl font-semibold text-forge-ink">Switch the machine on</h1>
          <p className="mt-2 max-w-2xl text-sm text-forge-dim">
            Five steps, in the order that unlocks things. Each one says what it switches on and what
            stays dark until it is done. You can finish all of it from this page — no terminal.
          </p>
          <p className="mt-3 text-xs font-medium text-forge-dim">
            {status === null ? 'Checking…' : `${doneCount} of 5 done`}
          </p>
        </header>

        {/* A failed status check must NOT dominate this page: step 1 is still perfectly doable, and a
            big red box above the one thing you can actually do is how a fixable state reads as a dead
            end. Quiet line, retry offered, page fully usable. */}
        {status === 'error' && (
          <p className="mt-3 text-xs text-forge-ember">
            Can’t read which keys are already on — the lights below may show “not set” even when they
            are. Saving still works.{' '}
            <button
              type="button"
              onClick={() => { setStatus(null); void load(); }}
              className="underline underline-offset-2 hover:text-forge-ink"
            >Check again</button>
          </p>
        )}

        {/* ---------- STEP 1: the one paste ---------- */}
        <Section
          n={1}
          icon={Lock}
          title="Connect Supabase"
          unlocks="This is the only step that cannot be done for you. One paste, and every key below becomes a field on this page instead of a command line."
          done={!!connected}
        >
          {connected === null ? <Skeleton className="h-9 w-full" /> : connected ? (
            <p className="text-sm text-forge-dim">
              Connected. The app can save its own keys now.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-forge-dim">
                Open{' '}
                <a
                  href="https://supabase.com/dashboard/account/tokens"
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-forge-ember hover:underline"
                >supabase.com → account → access tokens <ExternalLink size={11} /></a>
                , generate a token, and paste it here. It is stored on the server and never shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="sb-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="sbp_…"
                  className="w-72"
                  aria-label="Your Supabase access token"
                />
                <Button variant="primary" size="md" onClick={() => void doConnect()} disabled={busy || !token.trim()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Connect it
                </Button>
              </div>
            </div>
          )}
        </Section>

        {/* ---------- STEPS 2-4: the keys ---------- */}
        {STEPS.map((step) => (
          <Section
            key={step.n}
            n={step.n}
            icon={step.icon}
            title={step.title}
            unlocks={step.unlocks}
            done={stepDone(step)}
            locked={!connected}
          >
            <div className="space-y-4">
              {step.keys.map((k) => (
                <div key={k.env} className="rounded-xl border border-forge-border bg-forge-panel/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-forge-ink">{k.label}</span>
                    {k.optional && <span className="text-[11px] text-forge-dim">optional</span>}
                    {isSet(k.env)
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-forge-ok/15 px-2 py-0.5 text-[11px] font-medium text-forge-ok"><Check size={11} /> on</span>
                      : <span className="rounded-full bg-forge-ember/15 px-2 py-0.5 text-[11px] font-medium text-forge-ember">not set</span>}
                  </div>
                  {k.vendor && <p className="mt-0.5 text-[11px] text-forge-dim/70">{k.vendor}</p>}
                  {/* Running on a laptop, there is no address to offer and the reason matters more
                      than the missing button: leaving this blank is the SAFE state, because unset
                      refuses to queue a pitch at all while a local value mails a dead link. */}
                  {k.env === 'APP_ORIGIN' && typeof window !== 'undefined' && publicOriginProblem(window.location.origin) && (
                    <p className="mt-1 rounded-lg border border-forge-warn/40 bg-forge-warn/[0.06] px-2 py-1.5 text-[11px] text-forge-warn">
                      You are opening this app at <span className="font-mono">{window.location.origin}</span>, which only
                      works on this computer — so there is nothing to suggest here. Leave it blank until the app has a
                      real web address. Blank is the safe setting: no pitch is written at all, rather than one carrying
                      a link nobody else can open.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-forge-dim">
                    <span className="text-forge-dim/80">Without it: </span>{k.dark}
                  </p>
                  {k.where && (
                    <a
                      href={k.where.url} target="_blank" rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline"
                    >{k.where.text} <ExternalLink size={10} /></a>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      id={`k-${k.env}`}
                      type={k.env === 'APP_ORIGIN' ? 'text' : 'password'}
                      value={values[k.env] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [k.env]: e.target.value }))}
                      placeholder={k.placeholder}
                      className="w-64"
                      aria-label={k.label}
                      disabled={!connected}
                    />
                    {k.suggest && (
                      <Button
                        variant="ghost" size="sm" disabled={!connected}
                        onClick={() => setValues((s) => ({ ...s, [k.env]: k.suggest!.value() }))}
                      >{k.suggest.label}</Button>
                    )}
                    {/* Five of these sit on one page. They used to all read "Save", which is the
                        same defect as four buttons reading "Build the pitch": nothing on screen
                        tells you which one you are about to press. Each names its own field. */}
                    <Button
                      variant="outline" size="sm"
                      aria-label={`${isSet(k.env) ? 'Replace' : 'Save'} ${k.noun} — ${k.label}`}
                      onClick={() => void save(k)}
                      disabled={!connected || saving === k.env || !(values[k.env] ?? '').trim()}
                    >
                      {saving === k.env ? <Loader2 size={14} className="animate-spin" /> : null}
                      {isSet(k.env) ? `Replace ${k.noun}` : `Save ${k.noun}`}
                    </Button>
                  </div>
                </div>
              ))}
              {step.n === 4 && (
                <p className="text-xs text-forge-dim">
                  Email also needs three things that live in your account rather than on the server — a
                  from-address, a real mailing address (US law requires it in every commercial email),
                  and the outbound switch, which is off until you turn it on.{' '}
                  <Link to="/settings" className="text-forge-ember hover:underline">Open Settings <ArrowRight size={11} className="inline" /></Link>
                  {readiness && (
                    <>
                      {' '}Right now: {readiness.canSend ? 'all three are done.' : 'at least one is still missing.'}
                    </>
                  )}
                </p>
              )}
            </div>
          </Section>
        ))}

        {/* ---------- STEP 5: the clock ---------- */}
        <Section
          n={5}
          icon={Radio}
          title="Start the clock"
          unlocks="The machine works while you sleep — hunts run, approved posts go out at their time, replies and numbers come back."
          done={clockRunning}
          locked={!connected}
        >
          <p className="text-sm text-forge-dim">
            Paste the SAME password you saved in step 3. If the two do not match, every job fires and
            is turned away without a word — this page reads all-green and nothing actually happens.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              id="arm-secret"
              type="password"
              value={values.WORKER_SECRET ?? ''}
              onChange={(e) => setValues((s) => ({ ...s, WORKER_SECRET: e.target.value }))}
              placeholder="the password from step 3"
              className="w-64"
              aria-label="The password from step 3, again"
              disabled={!connected}
            />
            <Button variant="outline" size="sm" onClick={() => void arm()} disabled={busy || !connected}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} Start the clock
            </Button>
          </div>
          {clockRunning && status !== null && status !== 'error' && (
            <p className="mt-2 text-xs text-forge-ok">
              Running — {status.cron.filter((c) => c.active).length} jobs on the schedule.
            </p>
          )}
        </Section>

        <p className="mt-8 text-xs text-forge-dim">
          A key you just saved takes about a minute to reach the running functions, so a light here can
          lag behind the truth for a moment. Nothing you type on this page is stored by the app — keys
          go straight to Supabase, and their values are never read back.
        </p>
      </div>
    </AppShell>
  );
}

function Section({ n, icon: Icon, title, unlocks, done, locked, children }: {
  n: number; icon: typeof Sparkles; title: string; unlocks: string;
  done: boolean; locked?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`mt-5 rounded-2xl border p-4 ${done ? 'border-forge-ok/30 bg-forge-ok/[0.03]' : 'border-forge-border bg-forge-raised/40'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-forge-ok/15 text-forge-ok' : 'bg-forge-ember/15 text-forge-ember'}`}>
          {done ? <Check size={14} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon size={14} className={done ? 'text-forge-ok' : 'text-forge-ember'} />
            <h2 className="text-base font-semibold text-forge-ink">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-forge-dim">{unlocks}</p>
          <div className={`mt-3 ${locked ? 'pointer-events-none opacity-45' : ''}`}>
            {children}
          </div>
          {locked && <p className="mt-2 text-[11px] text-forge-dim">Finish step 1 first.</p>}
        </div>
      </div>
    </section>
  );
}
