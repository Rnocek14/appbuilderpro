// supabase/functions/booking/index.ts
// PUBLIC booking API — the customer-facing half of online booking. The public page never touches the DB
// directly; it calls this, which uses the SERVICE ROLE keyed by an enabled page's slug and only ever
// exposes that page's services + open slots (never another owner's data). One POST endpoint, two actions:
//   { action:'availability', slug, service_id? }              → { business_name, services[], service_id, slots[] }
//   { action:'book', slug, service_id, start, name, email?, phone?, notes? } → { ok, appointment } | { error, reason }
//
// Double-booking is caught by the DB gist exclusion constraint on confirmed appointments (race-proof) —
// two customers racing the last slot: one insert wins, the other gets a clean "taken". validateBooking is
// the friendly pre-check so the page shows only bookable times. On a successful booking we alert the
// operator (a note + their webhook ping); the customer sees an on-screen confirmation. Nothing here sends
// marketing — a booking is transactional and customer-initiated.
//
// Deploy: npx supabase functions deploy booking
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { availableSlots, validateBooking, type HoursRule, type Interval } from '../../../src/lib/garvis/booking/schedule.ts';
import { sendBookingNotice } from '../_shared/bookingNotify.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PageRow {
  id: string; owner_id: string; client_subscription_id: string | null; business_name: string;
  utc_offset_min: number; hours: HoursRule[]; slot_min: number; min_notice_min: number;
  max_advance_days: number; confirm_channel: 'email' | 'sms' | 'both'; enabled: boolean;
}
interface ServiceRow { id: string; name: string; duration_min: number; buffer_min: number; price_cents: number | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? 'availability');
    const slug = String(body.slug ?? '').trim();
    if (!slug) return json({ error: 'A booking link is required.' }, 400);

    const { data: page } = await admin.from('booking_pages')
      .select('id, owner_id, client_subscription_id, business_name, utc_offset_min, hours, slot_min, min_notice_min, max_advance_days, confirm_channel, enabled')
      .eq('slug', slug).maybeSingle();
    if (!page || !(page as PageRow).enabled) return json({ error: 'This booking page isn’t available.' }, 404);
    const pg = page as PageRow;

    const { data: svcRows } = await admin.from('booking_services')
      .select('id, name, duration_min, buffer_min, price_cents')
      .eq('page_id', pg.id).eq('active', true).order('sort', { ascending: true });
    const services = (svcRows ?? []) as ServiceRow[];
    if (services.length === 0) return json({ error: 'This business hasn’t listed any services to book yet.' }, 409);

    const now = Date.now();

    // Existing confirmed appointments become the busy set for availability + the race pre-check.
    const loadBusy = async (): Promise<Interval[]> => {
      const horizonIso = new Date(now + pg.max_advance_days * 86_400_000).toISOString();
      const { data } = await admin.from('appointments')
        .select('starts_at, ends_at').eq('page_id', pg.id).eq('status', 'confirmed')
        .gte('ends_at', new Date(now).toISOString()).lte('starts_at', horizonIso);
      return ((data ?? []) as { starts_at: string; ends_at: string }[])
        .map((a) => ({ start: Date.parse(a.starts_at), end: Date.parse(a.ends_at) }))
        .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end));
    };

    const paramsFor = (svc: ServiceRow, busy: Interval[]) => ({
      fromMs: now, nowMs: now, offsetMin: pg.utc_offset_min, hours: pg.hours ?? [],
      slotMin: pg.slot_min, serviceMin: svc.duration_min, bufferMin: svc.buffer_min,
      minNoticeMin: pg.min_notice_min, maxAdvanceDays: pg.max_advance_days, busy,
    });

    // ---- availability ------------------------------------------------------------------------
    if (action === 'availability') {
      const wantId = typeof body.service_id === 'string' ? body.service_id : null;
      const svc = services.find((s) => s.id === wantId) ?? services[0];
      const busy = await loadBusy();
      const slots = availableSlots({ ...paramsFor(svc, busy), limit: 240 });
      return json({
        business_name: pg.business_name,
        utc_offset_min: pg.utc_offset_min,   // the page renders slots in the BUSINESS's local time, not the visitor's
        service_id: svc.id,
        services: services.map((s) => ({ id: s.id, name: s.name, duration_min: s.duration_min, price_cents: s.price_cents })),
        slots,   // epoch ms
      });
    }

    // ---- book --------------------------------------------------------------------------------
    if (action === 'book') {
      const name = String(body.name ?? '').trim();
      const email = String(body.email ?? '').trim() || null;
      const phone = String(body.phone ?? '').trim() || null;
      const notes = String(body.notes ?? '').trim().slice(0, 500) || null;
      const svc = services.find((s) => s.id === body.service_id);
      const startMs = typeof body.start === 'number' ? body.start : Date.parse(String(body.start ?? ''));
      if (!name) return json({ error: 'Please add your name.' }, 400);
      if (!svc) return json({ error: 'Please choose a service.' }, 400);
      if (!Number.isFinite(startMs)) return json({ error: 'Please choose a time.' }, 400);
      if (!email && !phone) return json({ error: 'Add an email or phone so we can confirm.' }, 400);

      const busy = await loadBusy();
      const v = validateBooking(startMs, paramsFor(svc, busy));
      if (!v.ok) {
        const msg = v.reason === 'taken' ? 'That time was just booked — pick another.'
          : v.reason === 'too_soon' ? 'That time is too soon to book online — pick a later one.'
          : v.reason === 'too_far' ? 'That date is too far out — pick a sooner one.'
          : 'That time isn’t available — pick an open slot.';
        return json({ error: msg, reason: v.reason }, 409);
      }

      const endMs = startMs + svc.duration_min * 60_000;
      const { data: appt, error: insErr } = await admin.from('appointments').insert({
        page_id: pg.id, service_id: svc.id, owner_id: pg.owner_id, client_subscription_id: pg.client_subscription_id,
        customer_name: name, customer_email: email, customer_phone: phone, service_name: svc.name,
        starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString(),
        status: 'confirmed', source: 'booking_page', notes,
      }).select('id, starts_at, ends_at, service_name').single();

      if (insErr || !appt) {
        // 23P01 = exclusion_violation: someone won the slot in the race between our check and insert.
        const code = (insErr as { code?: string } | null)?.code;
        if (code === '23P01') return json({ error: 'That time was just booked — pick another.', reason: 'taken' }, 409);
        return json({ error: 'Couldn’t complete the booking — please try again.' }, 500);
      }

      // Confirm to the CUSTOMER (transactional, they just booked) over the page's channel — best-effort.
      const notice = await sendBookingNotice(admin, pg.owner_id, null, {
        businessName: pg.business_name, serviceName: svc.name, startsAt: new Date(startMs).toISOString(),
        utcOffsetMin: pg.utc_offset_min, toEmail: email, toPhone: phone, channel: pg.confirm_channel, kind: 'confirmation',
      }).catch(() => ({ email: false, sms: false }));
      if (notice.email || notice.sms) {
        await admin.from('appointments').update({ confirm_sent: true, updated_at: new Date().toISOString() })
          .eq('id', (appt as { id: string }).id).then(() => {}, () => {});
      }

      // Alert the operator (best-effort, never blocks the booking): a note in their feed + a webhook ping.
      const apptId = (appt as { id: string }).id;
      const when = new Date(startMs).toISOString();
      await admin.from('mind_events').insert({
        owner_id: pg.owner_id, event_type: 'note', source: 'booking',
        subject: `New booking: ${svc.name} for ${name}`,
        payload: { key: `booking:${apptId}`, appointment_id: apptId, when, email, phone },
      }).then(() => {}, () => {});
      try {
        const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', pg.owner_id).maybeSingle();
        const hook = (prof as { webhook_url?: string } | null)?.webhook_url;
        if (hook) await fetch(hook, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: `📅 New booking — ${svc.name} for ${name} (${pg.business_name})` }),
        }).catch(() => {});
      } catch { /* webhook is best-effort */ }

      return json({
        ok: true,
        sent: notice.email || notice.sms,   // did a confirmation actually go out?
        appointment: {
          business_name: pg.business_name, service_name: (appt as { service_name: string }).service_name,
          starts_at: (appt as { starts_at: string }).starts_at, utc_offset_min: pg.utc_offset_min,
        },
      });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
