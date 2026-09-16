// src/lib/garvis/huntReadiness.ts
// THE "READY TO HUNT & SEND" CONTRACT (pure). The scrape→demo→pitch→send pipeline has several
// hard prerequisites, and one of them — APP_ORIGIN — fails SILENTLY: with it unset, hunts run,
// build demos, and then refuse to queue any pitch (the demo link would be broken), so the
// operator sees "nothing happened" with no reason. This core turns every prerequisite into a
// visible pass/fail with the exact fix, and derives three honest gates:
//   canHunt     — can find businesses + build pitchable demos (SOMETHING to search with + APP_ORIGIN)
//   canSend     — can actually email a pitch (Resend + from-address + CAN-SPAM address + switch)
//   canAutoHunt — the DAILY unattended hunt will fire (canHunt + the clock armed)
// Nothing here talks to a DB or network — huntReadinessRun.ts gathers the inputs and calls this.

export type ReadinessNeed = 'hunt' | 'send' | 'auto';

export interface ReadinessInputs {
  appOriginSet: boolean;       // APP_ORIGIN env — the demo link's base; unset ⇒ pitches never queue
  /** ANTHROPIC_API_KEY. Claude finds businesses on its own (discover-run source:'claude'), so this
   *  ALONE satisfies discovery. This input did not exist while Places was the only finder, which is
   *  why the light told an owner with a working Claude key that they were "not ready to hunt". */
  aiKeySet: boolean;
  placesKeySet: boolean;       // GOOGLE_PLACES_API_KEY — optional second source of listings
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
  // Every `fix` names a place in THIS app that can do it. They used to name environment variables
  // and a hosting dashboard, which was accurate and useless: the one screen that could actually set
  // them did not exist yet. It does now, so the fix is a sentence and a page, not a command line.
  const items: ReadinessItem[] = [
    { key: 'finder', need: 'hunt', ok: i.aiKeySet || i.placesKeySet,
      label: 'Something to search with', fix: 'Add your Claude key on Start here, step 2. Claude finds businesses on its own — Google’s listings are an optional extra, not a requirement.' },
    { key: 'app_origin', need: 'hunt', ok: i.appOriginSet,
      label: 'This app’s own web address', fix: 'Add it on Start here, step 3. ⚠ Until it is set, sites still get built and NO email is ever written to go with them, because the link in it would be broken — so it looks like nothing happened.' },
    { key: 'resend', need: 'send', ok: i.resendKeySet,
      label: 'Something to send email with', fix: 'Add your Resend key on Start here, step 4, and verify your sending domain with Resend.' },
    { key: 'from_email', need: 'send', ok: !!(i.fromEmail && i.fromEmail.trim()),
      label: 'The address your email comes from', fix: 'Add it in Settings, under email. Every email needs a real sender.' },
    { key: 'physical_address', need: 'send', ok: !!(i.physicalAddress && i.physicalAddress.trim()),
      label: 'A real mailing address', fix: 'Add one in Settings, under email. U.S. law requires a physical address in every commercial email, and sending refuses without it.' },
    { key: 'kill_switch', need: 'send', ok: i.outboundEnabled,
      label: 'Permission to send at all', fix: 'Turn sending on in Settings, under email. It is off until you switch it on, so nothing can leave by accident.' },
    { key: 'clock', need: 'auto', ok: i.clockArmed,
      label: 'The clock, running', fix: 'Start the clock on Start here, step 5. Searching when you press the button works without it — only searching every day on its own needs it.' },
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
  if (r.canSend && r.canAutoHunt) return 'Everything is set up — you can search, build and send, and it will search every day on its own.';
  if (r.canSend && r.canHunt) return 'You can search, build and send right now. Start the clock on Start here if you want it searching every day without you.';
  if (r.canHunt && !r.canSend) return 'You can search and build sites, but nothing can be emailed yet.';
  if (!r.canHunt) return 'Not set up yet — finish Start here and this turns green.';
  return 'A couple of things are still missing.';
}
