// src/lib/garvis/connectorCatalog.ts
// THE API MANAGER's registry (pure; verified by connectorCatalog.verify.ts). One catalog drives the
// Connections hub: every integration the platform can use, what it powers in plain words, where its
// key comes from, and honest status copy. Three kinds:
//   'account'  — the user's own platform accounts (OAuth or token), consumed via provider_connections.
//   'service'  — per-user service keys with the PLATFORM env key as fallback: pasting one here means
//                sends/lookups run on the user's key and accounts; absent, the platform key carries it.
//   'platform' — platform-only keys (report status, never paste here): Anthropic stays platform-side
//                because credits meter AI usage — BYOK would change billing semantics; Stripe is the
//                operator's own payment rail.

export type ConnectorKind = 'account' | 'service' | 'platform';

export interface ConnectorSpec {
  id: string;
  name: string;
  kind: ConnectorKind;
  /** What breaks without it — plain words, user-side names. */
  powers: string;
  hint: string;
  /** Where the key comes from ('' for OAuth providers — the button is the path). */
  url: string;
  oauth?: boolean;
  tokenPlaceholder?: string;
  /** Twilio only: the connect form also asks for the sending number. */
  needsFromNumber?: boolean;
  /** Platform rows only: paste-able here — sealed, then pulled into function secrets by the
   *  deploy run (the app is the source of truth; CI bridges it). */
  pasteable?: boolean;
}

export const CONNECTOR_CATALOG: ConnectorSpec[] = [
  // ---- accounts ----
  { id: 'supabase', name: 'Supabase', kind: 'account', oauth: true, url: '',
    powers: 'a database per built app', hint: 'One-click OAuth — provisions a database per app in your org' },
  { id: 'github', name: 'GitHub', kind: 'account', oauth: true, url: '',
    powers: 'exporting projects to a repo', hint: 'One-click OAuth — export your projects to a repo' },
  { id: 'netlify', name: 'Netlify', kind: 'account', url: 'https://app.netlify.com/user/applications#personal-access-tokens',
    powers: 'publishing live sites + custom domains', hint: 'Personal access token (publish the live site)' },
  { id: 'docusign', name: 'DocuSign', kind: 'account', oauth: true, url: '',
    powers: 'e-signature paperwork', hint: 'One-click OAuth — send paperwork for e-signature (sandbox by default)' },
  { id: 'ayrshare', name: 'Ayrshare (social)', kind: 'account', url: 'https://app.ayrshare.com/api-key',
    powers: 'posting to connected social accounts', hint: 'API key — auto-post to connected social accounts (free tier: 50 posts/mo)' },
  // ---- service keys ----
  { id: 'resend', name: 'Resend (email)', kind: 'service', url: 'https://resend.com/api-keys', tokenPlaceholder: 're_…',
    powers: 'sending email — drips, follow-ups, campaigns',
    hint: 'API key — client email goes out on your account and sending domain' },
  { id: 'lob', name: 'Lob (direct mail)', kind: 'service', url: 'https://dashboard.lob.com/settings/api-keys', tokenPlaceholder: 'live_… or test_…',
    powers: 'postcard farming + mail attribution',
    hint: 'API key — postcards print and mail on your account (test_ keys stage without printing)' },
  { id: 'google_places', name: 'Google Places', kind: 'service', url: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com', tokenPlaceholder: 'AIza…',
    powers: 'prospect hunting — finding local businesses',
    hint: 'API key with Places API enabled ($200/mo free credit covers early volume)' },
  { id: 'twilio', name: 'Twilio (SMS + voice)', kind: 'service', url: 'https://console.twilio.com', tokenPlaceholder: 'AC…:auth_token', needsFromNumber: true,
    powers: 'the SMS/voice concierge',
    hint: 'Paste ACCOUNT_SID:AUTH_TOKEN (both on the console home page) plus your Twilio number' },
  // ---- platform ----
  { id: 'anthropic', name: 'Anthropic', kind: 'platform', pasteable: true, url: 'https://console.anthropic.com/settings/keys', tokenPlaceholder: 'sk-ant-…',
    powers: 'the AI brain — building, drafting, thinking',
    hint: 'Paste once — sealed here, then synced to the function fleet on each deploy run. Credits meter AI usage either way.' },
  { id: 'stripe', name: 'Stripe', kind: 'platform', url: '',
    powers: 'getting paid — subscriptions + reconciliation',
    hint: 'Platform key (your own payment rail)' },
];

export const SERVICE_PROVIDER_IDS = CONNECTOR_CATALOG.filter((c) => c.kind === 'service').map((c) => c.id);

/** Honest one-line status for a connector row. Counts on real facts, never guesses. */
export function connectorStatusLine(
  spec: ConnectorSpec,
  s: { connected: boolean; label: string | null; platformConfigured: boolean },
): string {
  if (spec.kind === 'platform') {
    if (s.platformConfigured) return 'configured (platform)';
    if (s.connected) return 'key saved — reaches the fleet on the next deploy run';
    return `not configured — ${spec.powers} won't run`;
  }
  if (s.connected) return `connected${s.label ? ` · ${s.label}` : ''}`;
  if (spec.kind === 'service') {
    return s.platformConfigured
      ? 'running on the platform key — connect your own to run on your accounts'
      : `not set up — ${spec.powers} won't run`;
  }
  return 'not connected';
}
