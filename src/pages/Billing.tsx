import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Zap } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Badge, Button, Card, StatCard } from '../components/ui';
import type { Subscription, UsageEvent } from '../types';
import { formatTokens, formatUsd } from '../lib/utils';

export default function Billing() {
  const { profile, usageThisMonth } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [events, setEvents] = useState<UsageEvent[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase.from('subscriptions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setSubscription((data?.[0] as Subscription) ?? null));
    supabase.from('usage_events').select('*').eq('user_id', profile.id)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .then(({ data }) => setEvents((data as UsageEvent[]) ?? []));
  }, [profile]);

  const tokens = events.reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);
  const cost = events.reduce((s, e) => s + Number(e.cost_usd), 0);
  const limit = profile?.monthly_generation_limit ?? 10;

  const upgrade = async () => {
    // INTEGRATION: Stripe Checkout.
    // 1. Create an edge function `create-checkout-session` using STRIPE_SECRET_KEY.
    // 2. supabase.functions.invoke('create-checkout-session') → window.location = session.url
    // 3. Handle the `checkout.session.completed` webhook to upsert `subscriptions`
    //    and bump profiles.plan / monthly_generation_limit.
    toast('info', 'Stripe is not connected on this instance. See README → Billing to wire Checkout in ~20 lines.');
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-forge-dim">Plan, limits, and this month's AI spend.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Generations used" value={`${usageThisMonth} / ${limit}`} hint="Resets monthly" />
          <StatCard label="Tokens this month" value={formatTokens(tokens)} hint="Input + output" />
          <StatCard label="AI cost this month" value={formatUsd(cost)} hint="Estimated at provider rates" />
        </div>

        <Card className="mt-6 p-5">
          <div className="flex items-center gap-3">
            <CreditCard size={18} className="text-forge-ember" />
            <div className="flex-1">
              <p className="text-sm font-medium capitalize">{profile?.plan} plan</p>
              <p className="text-xs text-forge-dim">
                {subscription
                  ? <>Status: <Badge tone={subscription.status === 'active' ? 'ok' : 'warn'}>{subscription.status}</Badge>{subscription.current_period_end && ` · renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}</>
                  : 'No payment method on file — this instance runs in stub mode until Stripe is connected.'}
              </p>
            </div>
            {profile?.plan === 'free' && (
              <Button onClick={upgrade}><Zap size={14} /> Upgrade to Pro</Button>
            )}
          </div>
        </Card>

        <Card className="mt-4 p-5 text-sm text-forge-dim">
          <p className="font-medium text-forge-ink">Self-hosting note</p>
          <p className="mt-1">
            Plans here meter the generation pipeline, not the product — it's your instance. Admins can change any
            user's plan and limits from the <Link to="/admin" className="text-forge-ember hover:underline">admin panel</Link>,
            no Stripe required.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
