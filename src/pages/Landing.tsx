import { Link } from 'react-router-dom';
import { Flame, Wand2, Code2, Eye, Rocket, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: Wand2, title: 'Describe it', body: 'Tell the forge what you want. It drafts a blueprint — roles, schema, pages — then writes every file.' },
  { icon: Code2, title: 'Own the code', body: 'A real file tree, Monaco editor, version history, and diffs. Nothing is hidden behind the chat.' },
  { icon: Eye, title: 'See it live', body: 'A sandboxed preview rebuilds as files change, with console output, device sizes, and one-click error fixes.' },
  { icon: Rocket, title: 'Ship it', body: 'Deployment records for Vercel, Netlify, and Supabase, with clean hooks to wire real deploy pipelines.' },
];

export default function Landing() {
  const { session } = useAuth();
  return (
    <div className="min-h-screen bg-ember-radial">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Flame size={22} className="text-forge-ember" />
          <span className="font-display text-lg font-semibold tracking-tight">FableForge</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/pricing" className="text-forge-dim hover:text-forge-ink">Pricing</Link>
          {session ? (
            <Link to="/dashboard" className="rounded-lg bg-forge-ember px-4 py-2 font-medium text-[#1A0E04] hover:bg-forge-heat">Open the forge</Link>
          ) : (
            <Link to="/auth" className="rounded-lg bg-forge-ember px-4 py-2 font-medium text-[#1A0E04] hover:bg-forge-heat">Sign in</Link>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center stagger">
          <p className="mx-auto mb-4 inline-block rounded-full border border-forge-ember/40 bg-forge-ember/10 px-3 py-1 text-xs text-forge-ember shadow-ember">
            Your own AI app builder — no credits, no meter
          </p>
          <h1 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Apps are forged here, <span className="bg-ember-gradient bg-clip-text text-transparent">not prompted into the void</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-forge-dim">
            FableForge turns a sentence into a working app: blueprint, database, files, live preview.
            You run it on your own Supabase project with your own model keys.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to={session ? '/new' : '/auth'} className="group inline-flex items-center gap-2 rounded-lg bg-ember-gradient px-6 py-3 font-medium text-[#1A0E04] shadow-soft transition-all duration-150 ease-forge hover:-translate-y-px hover:shadow-liftEmber active:scale-[0.98]">
              Start forging <ArrowRight size={16} className="transition-transform duration-200 ease-forge group-hover:translate-x-0.5" />
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
        FableForge — self-hosted app forging. MIT-style freedom: it's your code.
      </footer>
    </div>
  );
}
