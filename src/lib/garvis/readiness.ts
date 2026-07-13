// src/lib/garvis/readiness.ts
// THE OPERATOR CONSOLE — pure core (verified by readiness.verify.ts). You run the business FOR your
// client; this turns "is everything set up to operate?" from a hunt across five screens into one
// honest checklist. Given a snapshot of real state (clock, world, brand, email settings, contacts,
// connections), it computes each setup step's status and the exact next action. No state is invented:
// a thing is "done" only when the snapshot proves it, "needs an account" when it waits on an outside
// signup, and channel/optional steps never block the core "ready to operate" verdict.
//
// The impure half (readinessRun.ts) gathers the snapshot; the UI is ClientReadiness.tsx.

export interface ReadinessState {
  clock: 'never' | 'stale' | 'alive';
  worldCount: number;
  brandPresent: boolean;         // the primary world has a brand kit row
  brandHasCompliance: boolean;   // …with a compliance line (the regulated real-estate identifier)
  brandHasLook: boolean;         // …with a logo or a palette
  emailFrom: boolean;            // outreach_settings has a from_email
  emailAddress: boolean;         // …and a CAN-SPAM physical address
  emailEnabled: boolean;         // …and the outbound kill switch is ON
  contactsCount: number;
  docusignConnected: boolean;
  mlsConnected: boolean;
}

export type StepStatus = 'done' | 'todo' | 'needs_account' | 'optional_todo' | 'optional_done';
export type StepGroup = 'core' | 'channel' | 'optional';

export interface ReadinessStep {
  id: string;
  group: StepGroup;
  title: string;
  status: StepStatus;
  detail: string;      // what it is / why it matters — honest, never filler
  action: string;      // the button label for the fix
  href: string;        // where the fix lives
}

export interface Readiness {
  steps: ReadinessStep[];
  coreDone: number;
  coreTotal: number;
  coreReady: boolean;  // every CORE step done — the honest "ready to operate for her" verdict
  headline: string;
}

/** Compute the console from a snapshot. Order is the order you'd actually do it in. */
export function computeReadiness(s: ReadinessState): Readiness {
  const steps: ReadinessStep[] = [];

  // ---- CORE: the things that must be true to operate at all ----
  steps.push({
    id: 'clock', group: 'core',
    title: 'The clock is running',
    status: s.clock === 'alive' ? 'done' : 'todo',
    detail: s.clock === 'never'
      ? "Never armed. Until it is, nothing time-based runs — newsletters won't drain, reminders won't fire, watchers stay asleep."
      : s.clock === 'stale'
        ? 'The clock last ticked over 2 hours ago — the heartbeat may have stalled. Check Health.'
        : 'Ticking — the background work runs on schedule.',
    action: s.clock === 'alive' ? 'View Health' : 'Arm the clock', href: '/garvis/health',
  });

  steps.push({
    id: 'world', group: 'core',
    title: 'Her business exists as a world',
    status: s.worldCount > 0 ? 'done' : 'todo',
    detail: s.worldCount > 0
      ? 'Her venture is set up, with its studios and expertise inside.'
      : 'Describe her business on Command in one sentence and approve the draft — it is born with the real-estate studios and packs.',
    action: s.worldCount > 0 ? 'Open Ventures' : 'Create it on Command',
    href: s.worldCount > 0 ? '/garvis/webs' : '/garvis/command',
  });

  steps.push({
    id: 'brand', group: 'core',
    title: 'Her identity + compliance line',
    status: s.brandPresent && s.brandHasCompliance ? 'done' : 'todo',
    detail: !s.brandPresent
      ? "Add her brand in the world's Brain: logo, colors, and the brokerage/license compliance line every mailer and email must legally carry."
      : !s.brandHasCompliance
        ? 'Brand is set, but there is no compliance line — add her brokerage/license identifier so every send carries it automatically.'
        : `Set${s.brandHasLook ? ', with her look' : ''} — outbound goes out as her, with her required disclosure.`,
    action: 'Open Ventures', href: '/garvis/webs',
  });

  steps.push({
    id: 'contacts', group: 'core',
    title: 'Her contacts imported',
    status: s.contactsCount > 0 ? 'done' : 'todo',
    detail: s.contactsCount > 0
      ? `${s.contactsCount.toLocaleString()} on file — the newsletter and anniversary touches have someone to reach.`
      : "Import her past-client list by CSV — it powers the newsletter and the annual-home-value touches. The single highest-value thing to load.",
    action: s.contactsCount > 0 ? 'Open Contacts' : 'Import contacts', href: '/garvis/contacts',
  });

  steps.push({
    id: 'email', group: 'core',
    title: 'Email set up as her',
    status: s.emailFrom && s.emailAddress ? 'done' : 'needs_account',
    detail: s.emailFrom && s.emailAddress
      ? 'From-address and CAN-SPAM physical address are set — sends present as her business.'
      : "Needs a Resend key + a verified domain (ideally hers), her from-address, and her business's physical address, in Settings → Outreach.",
    action: 'Open Outreach settings', href: '/settings',
  });

  // ---- CHANNELS: light up as the outside accounts connect ----
  steps.push({
    id: 'email_on', group: 'channel',
    title: 'Sending switched on',
    status: s.emailEnabled ? 'done' : (s.emailFrom && s.emailAddress ? 'todo' : 'needs_account'),
    detail: s.emailEnabled
      ? 'The outbound kill switch is ON — approved sends actually go.'
      : 'Email is off. Flip the kill switch in Settings → Outreach when you are ready for the first real send.',
    action: 'Open Outreach settings', href: '/settings',
  });

  steps.push({
    id: 'docusign', group: 'channel',
    title: 'E-signature connected',
    status: s.docusignConnected ? 'done' : 'needs_account',
    detail: s.docusignConnected
      ? 'DocuSign is connected — paperwork can be sent for signature from the document studio.'
      : 'Connect DocuSign (free sandbox to start) so approved paperwork can be sent for signature.',
    action: 'Connect in Settings', href: '/settings',
  });

  // ---- OPTIONAL: real value, but not required to run her marketing + paperwork ----
  steps.push({
    id: 'mls', group: 'optional',
    title: 'MLS market feed',
    status: s.mlsConnected ? 'optional_done' : 'optional_todo',
    detail: s.mlsConnected
      ? 'A RESO feed is connected — market stats and the farm turnover math run on real listings.'
      : 'Optional: if her MLS offers a RESO Web API, connect it for real median-sold / DOM / months-of-supply. No feed = honestly empty, never fake.',
    action: 'Open Ventures', href: '/garvis/webs',
  });

  const core = steps.filter((x) => x.group === 'core');
  const coreDone = core.filter((x) => x.status === 'done').length;
  const coreTotal = core.length;
  const coreReady = coreDone === coreTotal;

  const headline = coreReady
    ? 'Ready to operate her business.'
    : `${coreDone} of ${coreTotal} essentials set up — ${coreTotal - coreDone} to go before you can run everything.`;

  return { steps, coreDone, coreTotal, coreReady, headline };
}

/** Group order + labels for the UI. */
export const GROUP_LABEL: Record<StepGroup, string> = {
  core: 'Essentials — needed to operate',
  channel: 'Channels — switch on as you connect accounts',
  optional: 'Optional — real value, not required',
};
