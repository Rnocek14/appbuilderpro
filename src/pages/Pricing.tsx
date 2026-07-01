import { Link, useNavigate } from 'react-router-dom';
import { Check, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    blurb: 'Kick the tires. Forge a few apps a month.',
    features: ['10 generations / month', '3 projects', 'Live preview & editor', 'Community templates'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: 'per month',
    blurb: 'For builders shipping real products.',
    features: ['500 generations / month', 'Unlimited projects', 'Version history & diffs', 'Priority pipeline', 'Deployment records'],
    highlight: true,
  },
];

export default function Pricing() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ember-radial">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2">
          <Flame size={20} className="text-forge-ember" />
          <span className="font-display font-semibold">FableForge</span>
        </Link>
        <Link to={session ? '/dashboard' : '/auth'} className="text-sm text-forge-dim hover:text-forge-ink">
          {session ? 'Dashboard' : 'Sign in'}
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-center font-display text-3xl font-bold tracking-tight">Simple, self-hosted pricing</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-forge-dim">
          You bring the model keys; plans meter the pipeline. Running your own instance? Set your own limits in the admin panel.
        </p>

        <div className="mt-10 grid gap-5 stagger sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`card-lift relative rounded-2xl border p-6 bg-panel-sheen ${plan.highlight ? 'border-forge-ember/50 bg-forge-panel shadow-ember' : 'border-forge-border bg-forge-panel'}`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 right-5 rounded-full bg-ember-gradient px-2.5 py-0.5 text-[11px] font-semibold text-[#1A0E04] shadow-soft">Popular</span>
              )}
              <h2 className="font-display text-lg font-semibold tracking-tight">{plan.name}</h2>
              <p className="mt-1 text-sm text-forge-dim">{plan.blurb}</p>
              <p className="mt-4"><span className="font-display text-3xl font-bold">{plan.price}</span> <span className="text-sm text-forge-dim">{plan.period}</span></p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check size={14} className="text-forge-ok" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={plan.highlight ? 'primary' : 'outline'}
                onClick={() => navigate(session ? '/billing' : '/auth')}
              >
                {profile?.plan === plan.id ? 'Current plan' : plan.id === 'free' ? 'Start free' : 'Upgrade to Pro'}
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
