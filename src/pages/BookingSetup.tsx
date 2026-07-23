// src/pages/BookingSetup.tsx  (/garvis/booking)
// Operator setup for online booking: create the public booking page (name, link, hours, timezone), list
// the bookable services, and flip it live. Writes straight to booking_pages / booking_services under the
// owner-all RLS policy. The public page lives at /book/:slug and is served by the `booking` edge function.

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Plus, Trash2, ExternalLink, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Common US offsets (minutes; local = UTC + offset). DST-era values — v1 is fixed-offset by design.
const OFFSETS = [
  { label: 'Eastern (UTC−4)', v: -240 }, { label: 'Central (UTC−5)', v: -300 },
  { label: 'Mountain (UTC−6)', v: -360 }, { label: 'Arizona (UTC−7)', v: -420 },
  { label: 'Pacific (UTC−7)', v: -420 }, { label: 'Alaska (UTC−8)', v: -480 }, { label: 'Hawaii (UTC−10)', v: -600 },
];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

interface Page {
  id?: string; business_name: string; slug: string; utc_offset_min: number;
  slot_min: number; min_notice_min: number; max_advance_days: number;
  confirm_channel: 'email' | 'sms' | 'both'; enabled: boolean;
}
interface DayHours { on: boolean; start: string; end: string }
interface Service { id?: string; name: string; duration_min: number; price?: string; active: boolean; _new?: boolean }

const BLANK_PAGE: Page = {
  business_name: '', slug: '', utc_offset_min: -300, slot_min: 30, min_notice_min: 120,
  max_advance_days: 30, confirm_channel: 'email', enabled: false,
};
const DEFAULT_HOURS = (): DayHours[] => DOW.map((_, i) => ({ on: i >= 1 && i <= 5, start: '09:00', end: '17:00' }));

export default function BookingSetup() {
  const [uid, setUid] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(BLANK_PAGE);
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS());
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setUid(u.user?.id ?? null);
    const { data: pg } = await supabase.from('booking_pages')
      .select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (pg) {
      const p = pg as Record<string, unknown>;
      setPage({
        id: p.id as string, business_name: (p.business_name as string) ?? '', slug: (p.slug as string) ?? '',
        utc_offset_min: (p.utc_offset_min as number) ?? -300, slot_min: (p.slot_min as number) ?? 30,
        min_notice_min: (p.min_notice_min as number) ?? 120, max_advance_days: (p.max_advance_days as number) ?? 30,
        confirm_channel: (p.confirm_channel as Page['confirm_channel']) ?? 'email', enabled: !!p.enabled,
      });
      setSlugTouched(true);
      const hrs = (p.hours as { dow: number; start: string; end: string }[]) ?? [];
      setHours(DOW.map((_, i) => {
        const r = hrs.find((h) => h.dow === i);
        return r ? { on: true, start: r.start, end: r.end } : { on: false, start: '09:00', end: '17:00' };
      }));
      const { data: svc } = await supabase.from('booking_services')
        .select('id, name, duration_min, price_cents, active').eq('page_id', p.id as string).order('sort');
      setServices(((svc ?? []) as Record<string, unknown>[]).map((s) => ({
        id: s.id as string, name: (s.name as string) ?? '', duration_min: (s.duration_min as number) ?? 60,
        price: s.price_cents != null ? String((s.price_cents as number) / 100) : '', active: !!s.active,
      })));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setDay = (i: number, patch: Partial<DayHours>) =>
    setHours((h) => h.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addService = () => setServices((s) => [...s, { name: '', duration_min: 60, price: '', active: true, _new: true }]);
  const setService = (i: number, patch: Partial<Service>) =>
    setServices((s) => s.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const save = async () => {
    setErr(''); setSaved(false);
    if (!uid) { setErr('Not signed in.'); return; }
    if (!page.business_name.trim()) { setErr('Add a business name.'); return; }
    const slug = slugify(page.slug || page.business_name);
    if (!slug) { setErr('Add a valid booking link.'); return; }
    const cleanServices = services.filter((s) => s.name.trim());
    if (cleanServices.length === 0) { setErr('Add at least one service to book.'); return; }
    setSaving(true);
    const hoursJson = hours.map((d, i) => (d.on ? { dow: i, start: d.start, end: d.end } : null)).filter(Boolean);
    const row = {
      owner_id: uid, business_name: page.business_name.trim(), slug,
      utc_offset_min: page.utc_offset_min, hours: hoursJson, slot_min: page.slot_min,
      min_notice_min: page.min_notice_min, max_advance_days: page.max_advance_days,
      confirm_channel: page.confirm_channel, enabled: page.enabled, updated_at: new Date().toISOString(),
    };
    const { data: up, error: pErr } = page.id
      ? await supabase.from('booking_pages').update(row).eq('id', page.id).select('id').single()
      : await supabase.from('booking_pages').insert(row).select('id').single();
    if (pErr || !up) {
      setSaving(false);
      setErr(pErr?.message?.includes('uq_booking_pages_slug') ? 'That booking link is taken — pick another.' : (pErr?.message ?? 'Couldn’t save.'));
      return;
    }
    const pageId = (up as { id: string }).id;
    // Replace the service set: delete removed rows, upsert the rest.
    const keepIds = cleanServices.map((s) => s.id).filter(Boolean) as string[];
    await supabase.from('booking_services').delete().eq('page_id', pageId).not('id', 'in', `(${keepIds.length ? keepIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);
    for (let i = 0; i < cleanServices.length; i++) {
      const s = cleanServices[i];
      const priceCents = s.price && Number.isFinite(Number(s.price)) ? Math.round(Number(s.price) * 100) : null;
      const svcRow = { page_id: pageId, owner_id: uid, name: s.name.trim(), duration_min: s.duration_min, price_cents: priceCents, active: s.active, sort: i, updated_at: new Date().toISOString() };
      if (s.id) await supabase.from('booking_services').update(svcRow).eq('id', s.id);
      else await supabase.from('booking_services').insert(svcRow);
    }
    setSaving(false); setSaved(true);
    setPage((p) => ({ ...p, id: pageId, slug }));
    void load();
  };

  const publicUrl = page.slug ? `${window.location.origin}/book/${page.slug}` : '';
  const inputCls = 'rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink outline-none focus:border-forge-ember';

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <CalendarDays size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Online booking</h1>
            <p className="text-sm text-forge-dim">A page where customers book a job themselves — pick a service, pick a time, done. No double-bookings.</p>
          </div>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : (
          <div className="space-y-6">
            {/* Basics */}
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Business name
                  <input value={page.business_name} className={inputCls}
                    onChange={(e) => { setPage((p) => ({ ...p, business_name: e.target.value })); if (!slugTouched) setPage((p) => ({ ...p, slug: slugify(e.target.value) })); }} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Booking link
                  <div className="flex items-center gap-1 text-sm text-forge-dim">/book/
                    <input value={page.slug} onChange={(e) => { setSlugTouched(true); setPage((p) => ({ ...p, slug: slugify(e.target.value) })); }} className={`${inputCls} flex-1`} /></div>
                </label>
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Timezone
                  <select value={page.utc_offset_min} onChange={(e) => setPage((p) => ({ ...p, utc_offset_min: Number(e.target.value) }))} className={inputCls}>
                    {OFFSETS.map((o) => <option key={o.label} value={o.v}>{o.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Slot length
                  <select value={page.slot_min} onChange={(e) => setPage((p) => ({ ...p, slot_min: Number(e.target.value) }))} className={inputCls}>
                    {[15, 30, 45, 60].map((v) => <option key={v} value={v}>every {v} min</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Earliest booking
                  <select value={page.min_notice_min} onChange={(e) => setPage((p) => ({ ...p, min_notice_min: Number(e.target.value) }))} className={inputCls}>
                    <option value={0}>anytime</option><option value={60}>1 hour ahead</option><option value={120}>2 hours ahead</option><option value={1440}>1 day ahead</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-forge-dim">Book up to
                  <select value={page.max_advance_days} onChange={(e) => setPage((p) => ({ ...p, max_advance_days: Number(e.target.value) }))} className={inputCls}>
                    {[14, 30, 60, 90].map((v) => <option key={v} value={v}>{v} days out</option>)}
                  </select>
                </label>
              </div>
            </section>

            {/* Hours */}
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
              <p className="mb-3 text-sm font-semibold text-forge-ink">Open hours</p>
              <div className="space-y-2">
                {hours.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <label className="flex w-24 items-center gap-2 text-sm text-forge-ink">
                      <input type="checkbox" checked={d.on} onChange={(e) => setDay(i, { on: e.target.checked })} /> {DOW[i]}
                    </label>
                    {d.on ? (
                      <div className="flex items-center gap-2 text-sm text-forge-dim">
                        <input type="time" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} className={inputCls} />
                        <span>to</span>
                        <input type="time" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} className={inputCls} />
                      </div>
                    ) : <span className="text-sm text-forge-dim/60">Closed</span>}
                  </div>
                ))}
              </div>
            </section>

            {/* Services */}
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-forge-ink">Services</p>
                <button onClick={addService} className="inline-flex items-center gap-1 text-xs font-medium text-forge-ember hover:underline"><Plus size={13} /> Add service</button>
              </div>
              {services.length === 0 ? (
                <p className="text-sm text-forge-dim">Add at least one thing customers can book (e.g. “Estimate”, “Service call”).</p>
              ) : (
                <div className="space-y-2">
                  {services.map((s, i) => (
                    <div key={s.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
                      <input value={s.name} placeholder="Service name" onChange={(e) => setService(i, { name: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
                      <select value={s.duration_min} onChange={(e) => setService(i, { duration_min: Number(e.target.value) })} className={inputCls}>
                        {[15, 30, 45, 60, 90, 120, 180, 240].map((v) => <option key={v} value={v}>{v} min</option>)}
                      </select>
                      <div className="flex items-center gap-1 text-sm text-forge-dim">$<input value={s.price ?? ''} placeholder="—" onChange={(e) => setService(i, { price: e.target.value })} className={`${inputCls} w-16`} inputMode="decimal" /></div>
                      <button onClick={() => setServices((sv) => sv.filter((_, j) => j !== i))} className="p-1.5 text-forge-dim hover:text-forge-err" aria-label="Remove"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <p className="text-[11px] text-forge-dim/70">Leave price blank if it varies — the page shows “ask” instead of a number.</p>
                </div>
              )}
            </section>

            {/* Go live + save */}
            <section className="rounded-xl border border-forge-border bg-forge-panel/40 p-4">
              <label className="flex items-center gap-2.5 text-sm font-medium text-forge-ink">
                <input type="checkbox" checked={page.enabled} onChange={(e) => setPage((p) => ({ ...p, enabled: e.target.checked }))} />
                Booking page is live
              </label>
              {publicUrl && (
                <a href={publicUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1.5 text-xs text-forge-dim hover:text-forge-ember">
                  <ExternalLink size={12} /> {publicUrl}
                </a>
              )}
            </section>

            {err && <p className="text-sm font-medium text-forge-err">{err}</p>}
            <div className="flex items-center gap-3">
              <button onClick={() => void save()} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-forge-ember px-5 py-2.5 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save booking page
              </button>
              {saved && <span className="text-sm font-medium text-forge-ok">Saved</span>}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
