import { Link } from 'react-router-dom';
import { Flame, Wand2, Eye, Rocket, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: Wand2, title: 'Make the marketing', body: 'Postcards, social posts, emails, logos — spread them on a board, compare, tell one what to change, spin a new version. Real facts fill in; unknowns stay visible, never invented.' },
  { icon: ShieldCheck, title: 'Nothing sends without you', body: 'Every email, post, and mailer waits in one honest approval queue. You approve; Garvis sends — with suppression, unsubscribe, and double-send guards enforced on the server.' },
  { icon: Eye, title: 'One place to run it', body: 'Contacts, replies, reminders, and results in a single queue that greets you with what to do next — grounded in your real data, not a blank box.' },
  { icon: Rocket, title: 'Builds what you need', body: 'When the work calls for a website or landing page, Garvis builds it with your real branding and wires up tracking — behind the same approval spine.' },
];

export default function Landing() {
  const { session } = useAuth();
  return (
    <div className="min-h-screen bg-ember-radial">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Flame size={22} className="text-forge-ember" />
          <span className="font-display text-lg font-semibold tracking-tight">Garvis</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/pricing" className="text-forge-dim hover:text-forge-ink">Pricing</Link>
          {session ? (
            <Link to="/garvis/command" className="rounded-lg bg-forge-ember px-4 py-2 font-medium text-[#1A0E04] hover:bg-forge-heat">Open Garvis</Link>
          ) : (
            <Link to="/auth" className="rounded-lg bg-forge-ember px-4 py-2 font-medium text-[#1A0E04] hover:bg-forge-heat">Sign in</Link>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center stagger">
          <p className="mx-auto mb-4 inline-block rounded-full border border-forge-ember/40 bg-forge-ember/10 px-3 py-1 text-xs text-forge-ember shadow-ember">
            Your own AI marketing team — on your Supabase, with your keys
          </p>
          <h1 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Your business, run by <span className="bg-ember-gradient bg-clip-text text-transparent">an AI chief of staff</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-forge-dim">
            Garvis runs the operation — marketing, paperwork, contacts, and an honest approval queue
            for everything that goes out — and builds the apps and sites you need along the way.
            Nothing sends without your say-so. Your Supabase, your keys.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to={session ? '/garvis/command' : '/auth'} className="group inline-flex items-center gap-2 rounded-lg bg-ember-gradient px-6 py-3 font-medium text-[#1A0E04] shadow-soft transition-all duration-150 ease-forge hover:-translate-y-px hover:shadow-liftEmber active:scale-[0.98]">
              Get started <ArrowRight size={16} className="transition-transform duration-200 ease-forge group-hover:translate-x-0.5" />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-forge-border px-6 py-3 text-forge-ink transition-all duration-150 ease-forge hover:-translate-y-px hover:border-forge-ember/50 hover:bg-forge-raised">
              See plans
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 stagger sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-lift rounded-xl border border-forge-border bg-forge-panel bg-panel-sheen p-5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-forge-ember/10 ring-1 ring-forge-ember/20">
                <Icon size={18} className="text-forge-ember" />
              </div>
              <h2 className="mt-3 font-display text-base font-semibold tracking-tight">{title}</h2>
              <p className="mt-1.5 text-sm text-forge-dim">{body}</p>
            </div>
          ))}
        </section>

        <section className="mb-20 flex items-center gap-3 rounded-xl border border-forge-border bg-forge-panel p-5 text-sm text-forge-dim">
          <ShieldCheck size={18} className="shrink-0 text-forge-ok" />
          Every project is protected by Postgres row-level security; model keys stay in edge function secrets, never the browser.
        </section>
      </main>

      <footer className="border-t border-forge-border py-6 text-center text-xs text-forge-dim">
        Garvis — your self-hosted AI business OS. MIT-style freedom: it's your code.
      </footer>
    </div>
  );
}
