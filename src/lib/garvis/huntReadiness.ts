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

export type ReadinessNeed = 'hunt' | 'send' | 'auto';

export interface ReadinessInputs {
  appOriginSet: boolean;       // APP_ORIGIN env — the demo link's base; unset ⇒ pitches never queue
  placesKeySet: boolean;       // GOOGLE_PLACES_API_KEY — business discovery
  resendKeySet: boolean;       // RESEND_API_KEY — the send provider
  fromEmail: string | null;    // outreach_settings.from_email
  physicalAddress: string | null; // outreach_settings.physical_address (CAN-SPAM: legally required)
  outboundEnabled: boolean;    // outreach_settings.outbound_enabled — THE kill switch
  clockArmed: boolean;         // heartbeat armed — only the AUTO daily hunt needs it
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
  ];

  const okFor = (need: ReadinessNeed) => items.filter((it) => it.need === need).every((it) => it.ok);
  // A demo you can't link is a demo you can't pitch, so APP_ORIGIN counts toward BOTH hunt and send.
  const canHunt = okFor('hunt');
  const canSend = okFor('send') && i.appOriginSet;
  const canAutoHunt = canHunt && i.clockArmed;
  return { items, canHunt, canSend, canAutoHunt };
}

/** One-line human summary of where things stand — for a badge/toast. */
export function readinessLine(r: Readiness): string {
  if (r.canSend && r.canAutoHunt) return 'Ready — find, build, and send are all live, and the daily hunt will fire.';
  if (r.canSend && r.canHunt) return 'Ready to hunt and send on demand — arm the heartbeat to run the daily hunt automatically.';
  if (r.canHunt && !r.canSend) return 'Can find businesses and build demos, but sending is not configured yet — see below.';
  if (!r.canHunt) return 'Not ready to hunt yet — the discovery/link prerequisites below are missing.';
  return 'Some prerequisites are missing — see below.';
}
