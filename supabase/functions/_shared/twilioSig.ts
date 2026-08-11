// supabase/functions/_shared/twilioSig.ts
// Twilio webhook signature validation — shared by every function Twilio POSTs to (voice-inbound,
// sms-inbound). These are public, unauthenticated endpoints that trigger real side effects, so
// every request must prove it came from Twilio: base64(HMAC-SHA1(auth token, url + sorted params))
// must equal the X-Twilio-Signature header. Fail-closed, constant work per candidate URL.

import { twilioSignatureBaseString } from '../../../src/lib/garvis/missedCall.ts';

/** base64(HMAC-SHA1(key, message)) — the Twilio request signature. */
export async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Validate against candidate URLs — Twilio signs over the EXACT URL it was configured with, which
 *  behind Supabase's proxy may differ from req.url. Callers pass the request URL and the canonical
 *  functions URL (with + without the ?query); any match accepts. Fail-closed. */
export async function twilioSignatureOk(authToken: string, signature: string, urls: string[], params: Record<string, string>): Promise<boolean> {
  for (const u of urls) {
    const expected = await hmacSha1Base64(authToken, twilioSignatureBaseString(u, params));
    if (expected === signature) return true;
  }
  return false;
}
