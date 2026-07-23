// src/pages/BookingPage.tsx  (/book/:slug)
// The PUBLIC booking page a business's customer opens to book a job — no login, no app chrome, just
// "pick a service, pick a time, you're booked." All data flows through the `booking` edge function
// (service role, keyed by slug); this page never touches the DB. Kept out of search indexes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Check, Clock, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Service { id: string; name: string; duration_min: number; price_cents: number | null }
interface Avail { business_name: string; utc_offset_min: number; service_id: string; services: Service[]; slots: number[] }
interface Booked { business_name: string; service_name: string; starts_at: string; utc_offset_min: number }

const money = (c: number | null) => (c == null ? null : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
// Render in the BUSINESS's local time (fixed offset), NOT the visitor's browser tz — otherwise the page
// would show a different time than the confirmation email/SMS (which uses the same offset). Shift the
// epoch by the offset so UTC getters read the business's wall-clock.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localAt = (ms: number, offMin: number) => new Date(ms + offMin * 60_000);
const dayKey = (ms: number, offMin: number) => { const d = localAt(ms, offMin); return `${DAYS[d.getUTCDay()]}, ${MONS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const clock = (ms: number, offMin: number) => { const d = localAt(ms, offMin); let h = d.getUTCHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return `${h}:${d.getUTCMinutes().toString().padStart(2, '0')} ${ap}`; };

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [avail, setAvail] = useState<Avail | null | 'error' | 'loading'>('loading');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<(Booked & { sent: boolean }) | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const load = useCallback(async (svcId?: string) => {
    const { data, error: err } = await supabase.functions.invoke('booking', {
      body: { action: 'availability', slug, ...(svcId ? { service_id: svcId } : {}) },
    });
    const d = data as (Avail & { error?: string }) | null;
    if (err || !d || d.error) { setAvail('error'); return; }
    setAvail(d);
    setServiceId(d.service_id);
  }, [slug]);

  useEffect(() => { if (slug) void load(); }, [slug, load]);

  const pickService = async (id: string) => {
    setServiceId(id); setSlot(null); setAvail('loading'); await load(id);
  };

  const book = async () => {
    if (!slot || !serviceId) return;
    setBusy(true); setError('');
    const { data, error: err } = await supabase.functions.invoke('booking', {
      body: { action: 'book', slug, service_id: serviceId, start: slot, name: name.trim(), email: email.trim(), phone: phone.trim() },
    });
    const d = data as { ok?: boolean; sent?: boolean; appointment?: Booked; error?: string } | null;
    setBusy(false);
    if (err || !d?.ok || !d.appointment) {
      setError(d?.error ?? 'Couldn’t complete the booking — please try again.');
      if (d?.error) void load(serviceId ?? undefined);   // refresh slots if a time was taken
      return;
    }
    setDone({ ...d.appointment, sent: !!d.sent });
  };

  const grouped = useMemo(() => {
    if (!avail || avail === 'loading' || avail === 'error') return [];
    const by = new Map<string, number[]>();
    for (const ms of avail.slots) { const k = dayKey(ms, avail.utc_offset_min); (by.get(k) ?? by.set(k, []).get(k)!).push(ms); }
    return [...by].slice(0, 14);
  }, [avail]);

  const shell = (inner: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">{inner}</div>
    </div>
  );

  if (avail === 'loading' && !done) return shell(<p className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>);
  if (avail === 'error') return shell(
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <p className="text-lg font-semibold">Booking isn’t available</p>
      <p className="mt-1 text-sm text-neutral-500">This link may be turned off or no longer exist.</p>
    </div>,
  );

  if (done) return shell(
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={24} /></span>
      <p className="text-xl font-semibold">You’re booked</p>
      <p className="mt-2 text-neutral-600">{done.service_name} with {done.business_name}</p>
      <p className="mt-1 font-medium">{dayKey(Date.parse(done.starts_at), done.utc_offset_min)} · {clock(Date.parse(done.starts_at), done.utc_offset_min)}</p>
      <p className="mt-4 text-xs text-neutral-400">{done.sent
        ? 'A confirmation is on its way. Need to change it? Just reply to that message.'
        : 'You’re all set. Save these details — the business will follow up if anything changes.'}</p>
    </div>,
  );

  const a = avail as Avail;
  const chosen = a.services.find((s) => s.id === serviceId);

  return shell(
    <>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Book with</p>
        <h1 className="text-2xl font-bold tracking-tight">{a.business_name}</h1>
      </div>

      {/* 1 — service */}
      {a.services.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-neutral-700">Choose a service</p>
          <div className="grid gap-2">
            {a.services.map((s) => (
              <button key={s.id} onClick={() => void pickService(s.id)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${serviceId === s.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                <span className="font-medium">{s.name}</span>
                <span className={`text-sm ${serviceId === s.id ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  <Clock size={12} className="mr-1 inline" />{s.duration_min} min{money(s.price_cents) ? ` · ${money(s.price_cents)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2 — time */}
      <div className="mb-6">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-700"><CalendarDays size={14} /> Pick a time
          {chosen && <span className="font-normal text-neutral-400">· {chosen.duration_min} min</span>}</p>
        {grouped.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">No open times right now — please check back, or call the business directly.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, times]) => (
              <div key={day}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {times.map((ms) => (
                    <button key={ms} onClick={() => { setSlot(ms); setError(''); }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${slot === ms ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                      {clock(ms, a.utc_offset_min)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3 — details + confirm */}
      {slot && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-neutral-700">Your details</p>
          <div className="grid gap-2.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name"
              className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email"
              className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (for text reminders)" type="tel" autoComplete="tel"
              className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
          </div>
          {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
          <button onClick={() => void book()} disabled={busy || !name.trim() || (!email.trim() && !phone.trim())}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Book {clock(slot, a.utc_offset_min)} · {dayKey(slot, a.utc_offset_min)}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-400">Times shown in {a.business_name}’s local time. No charge to book.</p>
        </div>
      )}
    </>,
  );
}
