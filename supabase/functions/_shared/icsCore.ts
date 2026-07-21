// supabase/functions/_shared/icsCore.ts
// THE CALENDAR SENSE (pure). A minimal, honest ICS reader for the one job the morning brief
// needs: "what is on the operator's calendar in the next 24 hours". Handles the two DTSTART
// shapes that cover Google/Outlook exports (all-day YYYYMMDD and UTC YYYYMMDDTHHMMSSZ);
// floating local times are treated as UTC (a bounded error the brief can carry); RECURRING
// events are NOT expanded (v1 — only their literal DTSTART is seen; honest limitation, stated
// here, never guessed around). Re-exported to src via src/lib/garvis/ics.ts; verified by
// ics.verify.ts.

export interface IcsEvent {
  title: string;
  startsAt: string;  // ISO
  allDay: boolean;
}

/** Unfold RFC 5545 folded lines (CRLF + space/tab continuation). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseDtstart(value: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const allDay = /^\d{8}$/.test(v);
  if (allDay) {
    const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`;
    return Number.isNaN(Date.parse(iso)) ? null : { iso, allDay: true };
  }
  const m = /^(\d{8})T(\d{6})Z?$/.exec(v);
  if (!m) return null;
  const d = m[1]; const t = m[2];
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : { iso, allDay: false };
}

/** Events whose start falls inside [windowStartIso, windowEndIso), soonest first, capped. */
export function parseIcsEvents(ics: string, windowStartIso: string, windowEndIso: string, cap = 10): IcsEvent[] {
  const from = Date.parse(windowStartIso);
  const to = Date.parse(windowEndIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return [];
  const events: IcsEvent[] = [];
  let inEvent = false;
  let summary = '';
  let start: { iso: string; allDay: boolean } | null = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; summary = ''; start = null; continue; }
    if (line === 'END:VEVENT') {
      if (inEvent && start && summary) {
        const at = Date.parse(start.iso);
        if (at >= from && at < to) events.push({ title: summary.slice(0, 120), startsAt: start.iso, allDay: start.allDay });
      }
      inEvent = false; continue;
    }
    if (!inEvent) continue;
    if (line.startsWith('SUMMARY')) {
      const i = line.indexOf(':');
      // Unescape the common ICS escapes so titles read as written.
      if (i > 0) summary = line.slice(i + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
    } else if (line.startsWith('DTSTART')) {
      const i = line.indexOf(':');
      if (i > 0) start = parseDtstart(line.slice(i + 1));
    }
  }
  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, cap);
}

/** One brief line per event — time in the owner's tz, all-day named as such, never invented. */
export function calendarLine(e: IcsEvent, timeZone: string): string {
  if (e.allDay) return `📅 All day: ${e.title}`;
  try {
    const t = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(e.startsAt));
    return `📅 ${t}: ${e.title}`;
  } catch {
    return `📅 ${e.startsAt.slice(11, 16)} UTC: ${e.title}`;
  }
}
