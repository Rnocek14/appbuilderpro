// supabase/functions/_shared/reScheduleCore.ts
// AMERICA/CHICAGO, STORED — not inferred from whichever machine happened to compute it.
// Pure: no Deno, no DOM, no Supabase. Verified by src/lib/garvis/reSchedule.verify.ts.
//
// Today social_posts.scheduled_for is a bare timestamptz and no social-scheduling code reads a
// timezone at all, so "tonight at 8" is whatever instant the browser produced. The precedent to copy
// is send-email, which already anchors its daily cap to outreach_settings.timezone; the anti-precedent
// is BookingSetup.tsx, which hardcodes 'Central (UTC−5)' and is therefore an hour wrong for half the
// year. Offsets are never hardcoded here — Intl carries the tz database, including DST history.
//
// The two honest edge cases, handled rather than hidden:
//   SPRING FORWARD — 2:30 AM on the US spring-forward Sunday does not exist. We resolve to the same
//     instant the clock actually reaches (3:30 AM local) and report adjusted:true so the operator is
//     TOLD, never silently moved.
//   FALL BACK — 1:30 AM on the fall-back Sunday happens twice. We deterministically pick the FIRST
//     (daylight-time) occurrence and report ambiguous:true.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Minutes the zone is ahead of UTC at a given instant (negative west of UTC). */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(instantMs));
  const at = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const hour = at('hour') === 24 ? 0 : at('hour');   // some engines emit hour 24 for midnight
  const asUtc = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'), at('second'));
  return asUtc - instantMs;
}

/** An instant rendered as the wall clock in a zone: 'YYYY-MM-DDTHH:mm'. */
export function instantToLocal(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(ms));
  const at = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const hour = at('hour') === '24' ? '00' : at('hour');
  return `${at('year')}-${at('month')}-${at('day')}T${hour}:${at('minute')}`;
}

export interface ResolvedSchedule {
  ok: true;
  iso: string;            // the instant
  local: string;          // what the operator asked for
  /** true when the wall time they typed does not exist (spring forward) — say so, never move quietly */
  adjusted: boolean;
  /** true when the wall time happens twice (fall back); we take the first occurrence */
  ambiguous: boolean;
  timeZone: string;
}
export type ScheduleResult = ResolvedSchedule | { ok: false; reason: string };

/** 'YYYY-MM-DDTHH:mm' in a zone → the instant it names. */
export function localToInstant(local: string, timeZone: string): ScheduleResult {
  const m = LOCAL_RE.exec((local ?? '').trim());
  if (!m) return { ok: false, reason: 'A schedule time looks like 2026-09-20T18:30 — that one does not.' };
  const [, y, mo, d, h, mi] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (!Number.isFinite(naive)) return { ok: false, reason: 'That is not a real date.' };

  let offset: number;
  try {
    offset = zoneOffsetMs(naive, timeZone);
  } catch {
    return { ok: false, reason: `"${timeZone}" is not a time zone this system knows.` };
  }
  // Two candidates: the offset in force at the naive instant, and the offset in force at that
  // candidate. Away from a DST seam they agree. At one they straddle it, which is the information
  // we need — so we test both against the wall clock actually asked for rather than iterating blind.
  const target = `${y}-${mo}-${d}T${h}:${mi}`;
  const candA = naive - offset;
  const candB = naive - zoneOffsetMs(candA, timeZone);
  const hits = (ms: number): boolean => instantToLocal(new Date(ms).toISOString(), timeZone) === target;
  const hitA = hits(candA), hitB = hits(candB);

  let guess: number;
  let adjusted = false;
  if (hitA && hitB) guess = Math.min(candA, candB);      // both real → the first occurrence
  else if (hitB) guess = candB;
  else if (hitA) guess = candA;
  else {
    // Neither renders the requested wall clock: it does not exist (clocks jumped forward). Take the
    // LATER candidate — the instant the clock actually reaches when it skips.
    adjusted = true;
    guess = Math.max(candA, candB);
  }

  // Ambiguity: the same wall clock occurring twice (clocks fell back). Check both directions so the
  // answer is the FIRST occurrence whichever candidate we landed on.
  const HOUR = 3600_000;
  let ambiguous = false;
  if (!adjusted) {
    if (hits(guess - HOUR)) { guess -= HOUR; ambiguous = true; }
    else if (hits(guess + HOUR)) { ambiguous = true; }
  }

  return {
    ok: true,
    iso: new Date(guess).toISOString(),
    local: target,
    adjusted,
    ambiguous,
    timeZone,
  };
}

/** The human line. 'Sunday, March 8 at 3:30 AM CDT' — with the zone named, always. */
export function describeSchedule(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(ms)).replace(' at ', ' at ');
  } catch {
    return new Date(ms).toISOString();
  }
}

/** What to tell the operator when their wall time was not the one they get. '' when it was. */
export function scheduleCaveat(r: ResolvedSchedule): string {
  if (r.adjusted) {
    return `${r.local.slice(11)} does not exist on that date in ${r.timeZone} (clocks jump forward) — this will post at ${instantToLocal(r.iso, r.timeZone).slice(11)}.`;
  }
  if (r.ambiguous) {
    return `${r.local.slice(11)} happens twice on that date in ${r.timeZone} (clocks fall back) — this takes the first one.`;
  }
  return '';
}

/** Is this instant already gone? `now` is injected — determinism. */
export function isPast(iso: string, nowIso: string): boolean {
  const a = Date.parse(iso), b = Date.parse(nowIso);
  return Number.isFinite(a) && Number.isFinite(b) && a <= b;
}
