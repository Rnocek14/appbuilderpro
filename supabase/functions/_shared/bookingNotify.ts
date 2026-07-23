// supabase/functions/_shared/bookingNotify.ts
// Transactional booking notices — the confirmation sent the moment a customer books, and the reminder
// sent ~a day before. These are NOT marketing: the customer just booked and handed us their contact
// details for exactly this, so they send DIRECTLY via Resend / Twilio, bypassing the outreach
// suppression / marketing-consent / kill-switch gates that (correctly) guard COLD outreach. Fail-soft
// everywhere: a notice never blocks a booking, and a missing key just skips that channel.

import { toE164, validSmsBody } from '../../../src/lib/garvis/sms.ts';

export interface BookingNotice {
  businessName: string;
  serviceName: string;
  startsAt: string;             // ISO
  utcOffsetMin: number;         // page's fixed offset (local = UTC + this)
  toEmail: string | null;
  toPhone: string | null;
  channel: 'email' | 'sms' | 'both';
  kind: 'confirmation' | 'reminder';
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Render an ISO instant in the page's local wall-clock (fixed offset), e.g. "Monday, Jan 1 at 9:00 AM". */
function fmtWhen(iso: string, offsetMin: number): string {
  const local = new Date(Date.parse(iso) + offsetMin * 60_000);   // shift so UTC getters read wall-clock
  let h = local.getUTCHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  return `${DAYS[local.getUTCDay()]}, ${MONS[local.getUTCMonth()]} ${local.getUTCDate()} at ${h}:${mm} ${ap}`;
}

/** Send the confirmation/reminder over the page's configured channel(s). Returns which channels went out.
 *  `fromNumberOverride` lets a client's own Twilio number send it; null uses the global TWILIO_FROM_NUMBER. */
// deno-lint-ignore no-explicit-any
export async function sendBookingNotice(admin: any, ownerId: string, fromNumberOverride: string | null, n: BookingNotice): Promise<{ email: boolean; sms: boolean }> {
  const when = fmtWhen(n.startsAt, n.utcOffsetMin);
  const lead = n.kind === 'reminder' ? 'Reminder' : "You're booked";
  const out = { email: false, sms: false };
  const wantEmail = (n.channel === 'email' || n.channel === 'both') && !!n.toEmail;
  const wantSms = (n.channel === 'sms' || n.channel === 'both') && !!n.toPhone;

  // ---- SMS (Twilio) — the customer gave their number FOR reminders, so this is consented + transactional.
  if (wantSms) {
    try {
      const sid = Deno.env.get('TWILIO_ACCOUNT_SID'); const tok = Deno.env.get('TWILIO_AUTH_TOKEN');
      const from = fromNumberOverride || Deno.env.get('TWILIO_FROM_NUMBER');
      const to = toE164(n.toPhone);
      const body = `${lead}: ${n.serviceName} with ${n.businessName} — ${when}. Reply here to reschedule.`;
      if (sid && tok && from && to && validSmsBody(body)) {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { authorization: `Basic ${btoa(`${sid}:${tok}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: from, Body: body }),
        });
        out.sms = res.ok;
      }
    } catch { /* fail-soft — a reminder never blocks anything */ }
  }

  // ---- Email (Resend) — from the operator's verified sender, shown as the business's name.
  if (wantEmail) {
    try {
      const key = Deno.env.get('RESEND_API_KEY');
      const { data: s } = await admin.from('outreach_settings')
        .select('from_email, from_name, reply_to, company_name').eq('owner_id', ownerId).maybeSingle();
      const st = (s ?? {}) as { from_email?: string; from_name?: string; reply_to?: string; company_name?: string };
      if (key && st.from_email) {
        const fromName = (n.businessName || st.from_name || st.company_name || 'Bookings').replace(/[<>"]/g, '');
        const subject = n.kind === 'reminder' ? `Reminder: your ${n.serviceName} appointment` : `Booking confirmed — ${n.serviceName}`;
        const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#111;line-height:1.6">`
          + `<p style="margin:0 0 4px">${lead === 'Reminder' ? 'A quick reminder of your upcoming appointment.' : "You're all set — here are the details."}</p>`
          + `<p style="font-size:18px;font-weight:600;margin:12px 0 2px">${esc(n.serviceName)}</p>`
          + `<p style="margin:0;color:#333">${esc(when)}</p>`
          + `<p style="margin:8px 0 16px;color:#555">with ${esc(n.businessName)}</p>`
          + `<p style="color:#777;font-size:13px">Need to change it? Just reply to this email.</p></div>`;
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: `${fromName} <${st.from_email}>`, to: n.toEmail, subject, html, reply_to: st.reply_to || st.from_email }),
        });
        out.email = res.ok;
      }
    } catch { /* fail-soft */ }
  }

  return out;
}
