// src/lib/garvis/booking/schedule.ts
// PURE core of online booking (no network/DOM; verified by schedule.verify.ts). It answers the only two
// questions the booking edge function needs: "what slots are open?" and "is THIS requested slot legal?".
//
// All time math is epoch milliseconds with a FIXED utc offset per page (local = UTC + offsetMin), so it's
// exact and fully unit-testable with zero timezone library. The tradeoff — it does not follow a DST
// change on its own — is a documented v1 limitation; named-zone + DST is a later upgrade. The DATABASE
// (gist exclusion constraint on confirmed appointments) is the real race-proof double-booking guard;
// these functions are the friendly pre-check so a customer sees only bookable times.
//
// Deno-safe leaf (imported by the `booking` edge function via a .ts specifier).

export interface HoursRule { dow: number; start: string; end: string } // dow 0=Sun … 6=Sat, "HH:MM" local
export interface Interval { start: number; end: number }               // epoch ms, half-open [start, end)

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** "HH:MM" (24h) → minutes from midnight, or null if malformed. */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Open intervals (minutes-from-local-midnight) for a local day-of-week — malformed or non-positive
 *  ranges dropped, sorted by start. A day with no rule is closed. */
export function openMinutesForDow(hours: HoursRule[], dow: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const r of hours ?? []) {
    if (r?.dow !== dow) continue;
    const s = parseHHMM(r.start); const e = parseHHMM(r.end);
    if (s == null || e == null || e <= s) continue;
    out.push([s, e]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export interface SlotParams {
  fromMs: number;         // window start (UTC ms), usually now
  nowMs: number;          // reference "now" for min-notice
  offsetMin: number;      // local = UTC + offsetMin (e.g. US Central DST = -300)
  hours: HoursRule[];     // weekly local open hours
  slotMin: number;        // granularity of start times
  serviceMin: number;     // duration of the service being booked
  bufferMin: number;      // free padding kept around each appointment
  minNoticeMin: number;   // earliest bookable = now + this
  maxAdvanceDays: number; // latest bookable day out from now
  busy: Interval[];       // existing confirmed appointments (UTC ms)
  limit?: number;         // cap on slots returned (default 500)
}

/** Does a candidate [start, start+serviceMin) sit `buffer` clear of every busy interval? */
function clashes(startMs: number, serviceMin: number, bufMs: number, busy: Interval[]): boolean {
  const end = startMs + serviceMin * MIN_MS;
  for (const b of busy) if (startMs < b.end + bufMs && b.start < end + bufMs) return true;
  return false;
}

/** Every bookable slot start (UTC ms) in the window, respecting hours, notice, horizon, and existing
 *  appointments. Deterministic and sorted ascending. */
export function availableSlots(p: SlotParams): number[] {
  const slotMin = Math.max(5, Math.trunc(p.slotMin) || 30);
  const serviceMin = Math.max(5, Math.trunc(p.serviceMin) || 60);
  const bufMs = Math.max(0, Math.trunc(p.bufferMin) || 0) * MIN_MS;
  const earliest = Math.max(p.fromMs, p.nowMs + Math.max(0, p.minNoticeMin) * MIN_MS);
  const horizon = p.nowMs + Math.max(1, p.maxAdvanceDays) * DAY_MS;
  const limit = p.limit && p.limit > 0 ? p.limit : 500;
  const off = p.offsetMin * MIN_MS;
  // Shift into "local epoch" so UTC getters read local wall-clock; iterate local days.
  const startDay = Math.floor((earliest + off) / DAY_MS);
  const endDay = Math.floor((horizon + off) / DAY_MS);
  const out: number[] = [];
  for (let d = startDay; d <= endDay; d++) {
    const localMidnight = d * DAY_MS;
    const dow = new Date(localMidnight).getUTCDay();
    for (const [os, oe] of openMinutesForDow(p.hours, dow)) {
      for (let t = os; t + serviceMin <= oe; t += slotMin) {
        const utcStart = localMidnight + t * MIN_MS - off;
        if (utcStart < earliest || utcStart > horizon) continue;
        if (clashes(utcStart, serviceMin, bufMs, p.busy)) continue;
        out.push(utcStart);
        if (out.length >= limit) { out.sort((a, b) => a - b); return out; }
      }
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

export type BookingReason = 'too_soon' | 'too_far' | 'closed' | 'taken';

/** Server-side validation of ONE requested start before we insert it — the friendly, specific "why not"
 *  (the DB constraint is the ultimate guard against a race). */
export function validateBooking(startMs: number, p: SlotParams): { ok: true } | { ok: false; reason: BookingReason } {
  const serviceMin = Math.max(5, Math.trunc(p.serviceMin) || 60);
  const bufMs = Math.max(0, Math.trunc(p.bufferMin) || 0) * MIN_MS;
  const earliest = Math.max(p.fromMs, p.nowMs + Math.max(0, p.minNoticeMin) * MIN_MS);
  const horizon = p.nowMs + Math.max(1, p.maxAdvanceDays) * DAY_MS;
  if (startMs < earliest) return { ok: false, reason: 'too_soon' };
  if (startMs > horizon) return { ok: false, reason: 'too_far' };
  const off = p.offsetMin * MIN_MS;
  const local = startMs + off;
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS;
  const dow = new Date(localMidnight).getUTCDay();
  const t = Math.round((local - localMidnight) / MIN_MS);
  const inHours = openMinutesForDow(p.hours, dow).some(([os, oe]) => t >= os && t + serviceMin <= oe);
  if (!inHours) return { ok: false, reason: 'closed' };
  if (clashes(startMs, serviceMin, bufMs, p.busy)) return { ok: false, reason: 'taken' };
  return { ok: true };
}
