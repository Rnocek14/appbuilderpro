// src/lib/garvis/huntReadiness.ts
// THE "READY TO HUNT & SEND" CONTRACT (pure). The scrape→demo→pitch→send pipeline has several
// hard prerequisites, and one of them — APP_ORIGIN — fails SILENTLY: with it unset, hunts run,
// build demos, and then refuse to queue any pitch (the demo link would be broken), so the
// operator sees "nothing happened" with no reason. This core turns every prerequisite into a
// visible pass/fail with the exact fix, and derives three honest gates:
//   canHunt     — can find businesses + build pitchable demos (Places key + APP_ORIGIN)
//   canSend     — can actually email a pitch (Resend + from-address + CAN-SPAM address + switch)
//   canAutoHunt — the DAILY unattended hunt will fire (canHunt + the clock armed)
// Nothing here talks to a DB or network — huntReadinessRun.ts gathers the inputs and calls this.

export type ReadinessNeed = 'hunt' | 'send' | 'auto' | 'sell';

export interface ReadinessInputs {
  appOriginSet: boolean;       // APP_ORIGIN env — the demo link's base; unset ⇒ pitches never queue
  placesKeySet: boolean;       // GOOGLE_PLACES_API_KEY — business discovery
  resendKeySet: boolean;       // RESEND_API_KEY — the send provider
  fromEmail: string | null;    // outreach_settings.from_email
  physicalAddress: string | null; // outreach_settings.physical_address (CAN-SPAM: legally required)
  outboundEnabled: boolean;    // outreach_settings.outbound_enabled — THE kill switch
  clockArmed: boolean;         // heartbeat armed — only the AUTO daily hunt needs it
  huntOrderActive: boolean;    // a client_hunt standing order exists and is active (the daily hunt)
  netlifyTokenSet: boolean;    // NETLIFY_AUTH_TOKEN — a paid demo publishes itself
  stripeWebhookSet: boolean;   // STRIPE_WEBHOOK_SECRET — a payment is recorded + fulfilled with no click
  websiteLinkSet: boolean;     // agency_billing_settings.website_payment_link
  carePlanLinkSet: boolean;    // agency_billing_settings.automation_payment_link
  notifyChannel: boolean;      // a webhook_url, or a from_email so the brief can reach your own inbox
}

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  need: ReadinessNeed;         // which gate this prerequisite belongs to
  fix: string;                 // exactly how/where to satisfy it
}

export interface Readiness {
  items: ReadinessItem[];
  canHunt: boolean;            // find + build pitchable demos
  canSend: boolean;            // email a pitch through the gated path
  canAutoHunt: boolean;        // the daily unattended hunt will actually fire
  canSell: boolean;            // a prospect can pay from the demo and the site goes live with no click
}

export function huntReadiness(i: ReadinessInputs): Readiness {
  const items: ReadinessItem[] = [
    { key: 'places', need: 'hunt', ok: i.placesKeySet,
      label: 'Google Places key', fix: 'Set GOOGLE_PLACES_API_KEY in Supabase secrets — without it, no businesses are found.' },
    { key: 'app_origin', need: 'hunt', ok: i.appOriginSet,
      label: 'App origin (demo link base)', fix: 'Set APP_ORIGIN to your deployed URL. ⚠ Until it is set, hunts build demos but NO pitch is ever queued (the demo link would be broken).' },
    { key: 'resend', need: 'send', ok: i.resendKeySet,
      label: 'Email provider', fix: 'Set RESEND_API_KEY (and verify your sending domain in Resend) so approved pitches can actually send.' },
    { key: 'from_email', need: 'send', ok: !!(i.fromEmail && i.fromEmail.trim()),
      label: 'From address', fix: 'Add your from_email in Setup → outreach settings — every send needs a real sender.' },
    { key: 'physical_address', need: 'send', ok: !!(i.physicalAddress && i.physicalAddress.trim()),
      label: 'Mailing address (CAN-SPAM)', fix: 'Add a physical mailing address in Setup — U.S. law requires it in every commercial email; send-email refuses without it.' },
    { key: 'kill_switch', need: 'send', ok: i.outboundEnabled,
      label: 'Outbound switch ON', fix: 'Flip outbound_enabled on in Setup — it is OFF by default so nothing sends until you opt in.' },
    { key: 'clock', need: 'auto', ok: i.clockArmed,
      label: 'Heartbeat armed (daily auto-hunt)', fix: 'Arm the heartbeat on the Health page. On-demand hunts from Win Clients work without it; only the DAILY automatic hunt needs it.' },
    { key: 'hunt_order', need: 'auto', ok: i.huntOrderActive,
      label: 'Daily hunt switched on', fix: 'Start the daily hunt on Win Clients (one button). It spends its quota across the day: a few searches and one demo per 15-minute tick.' },
    { key: 'notify', need: 'auto', ok: i.notifyChannel,
      label: 'Where the morning brief lands', fix: 'Set a notification webhook in Settings (Slack/Discord/any URL) — or just set your from_email: the brief and SOLD pings then go to your own inbox.' },
    // SELL: what makes a sale zero-click — the demo shows a price, the payment link takes the
    // card, the webhook records it and publishes the stashed site. Each missing piece degrades
    // honestly (a "PAID — click Go Live" ping), but the point is not to need the click.
    { key: 'website_link', need: 'sell', ok: i.websiteLinkSet,
      label: 'Stripe link: New Website', fix: 'Paste the Stripe Payment Link for the one-time website on Client billing — the demo\'s "Make it mine" sends the prospect there.' },
    { key: 'care_plan_link', need: 'sell', ok: i.carePlanLinkSet,
      label: 'Stripe link: Website + Care Plan', fix: 'Paste the monthly Payment Link on Client billing — without it the monthly offer on every demo goes nowhere.' },
    { key: 'stripe_webhook', need: 'sell', ok: i.stripeWebhookSet,
      label: 'Stripe webhook', fix: 'Point a Stripe checkout.session.completed webhook at stripe-webhook and set STRIPE_WEBHOOK_SECRET — a payment then records itself and publishes the site with no click.' },
    { key: 'netlify', need: 'sell', ok: i.netlifyTokenSet,
      label: 'Hosting token (auto-publish)', fix: 'Set NETLIFY_AUTH_TOKEN so a paid demo publishes itself from the stashed HTML. Without it every sale waits on a Go Live click.' },
  ];

  const okFor = (need: ReadinessNeed) => items.filter((it) => it.need === need).every((it) => it.ok);
  // A demo you can't link is a demo you can't pitch, so APP_ORIGIN counts toward BOTH hunt and send.
  const canHunt = okFor('hunt');
  const canSend = okFor('send') && i.appOriginSet;
  const canAutoHunt = canHunt && okFor('auto');
  const canSell = okFor('sell');
  return { items, canHunt, canSend, canAutoHunt, canSell };
}

/** One-line human summary of where things stand — for a badge/toast. */
export function readinessLine(r: Readiness): string {
  if (r.canSend && r.canAutoHunt && r.canSell) return 'Ready — find, build, send, and get paid are all live. Your job is the slate each morning.';
  if (r.canSend && r.canAutoHunt) return 'Find, build, and send are live and the daily hunt will fire — finish the payment links so a sale needs no click from you.';
  if (r.canSend && r.canHunt) return 'Ready to hunt and send on demand — arm the heartbeat to run the daily hunt automatically.';
  if (r.canHunt && !r.canSend) return 'Can find businesses and build demos, but sending is not configured yet — see below.';
  if (!r.canHunt) return 'Not ready to hunt yet — the discovery/link prerequisites below are missing.';
  return 'Some prerequisites are missing — see below.';
}
