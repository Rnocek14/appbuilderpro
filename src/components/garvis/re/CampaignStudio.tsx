// src/components/garvis/re/CampaignStudio.tsx
// THE REAL-ESTATE CAMPAIGN STUDIO — the one surface a working realtor opens.
//
// It obeys the simplicity doctrine literally (CLAUDE.md), copying the Fact Channel Studio's shape:
//   WORK FIRST — the pulse line answers "who needs attention, what is scheduled, what is working"
//     before anything is typed. Zero-input value: the page is useful on arrival.
//   ONE PRIMARY ACTION — a single orange button: draft this community's post. Everything else is
//     ghost or outline.
//   CHROME COLLAPSED — "Community setup" (adding a community, adding a sourced fact) lives behind a
//     disclosure, closed by default. Nothing is removed; it is one click away.
//
// And the honesty spine, visibly: a draft assembled from verified facts shows its holes rather than
// filling them, the queue button refuses while a hole remains, and a fact that is unsourced or past
// its review date is named — never quietly dropped and never quietly used.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpenCheck, CheckCircle2, ExternalLink, ImagePlus, Loader2, Plus, Send, X } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Skeleton } from '../../ui';
import { DRAFT_KINDS, type DraftKind } from '../../../lib/garvis/reDraft';
import { citationBlocker } from '../../../lib/garvis/reFacts';
import { localToInstant, scheduleCaveat } from '../../../lib/garvis/reSchedule';
import { MEDIA_REQUIRED, PLATFORM_LABEL, checkDraft, type Platform } from '../../../lib/garvis/social';
import {
  addFact, composeDraft, createCommunity, listCommunities, listFacts, loadPulse, queueDraft, uploadPostPhoto,
  type Community, type FactWithSources, type PulseState,
} from '../../../lib/garvis/re/reRun';

type Toast = (kind: 'success' | 'error' | 'info', message: string) => void;

const TZ = 'America/Chicago';
// The six accounts a working agent actually keeps, in the order she listed them. This used to be
// Facebook alone, because attaching media was Phase 1b and socialCore refuses a text-only post to
// Instagram — so the honest move was to hide the platforms that would be refused. Media is here now,
// so the platforms are too; the refusal is still honest, it just shows up as a named blocker under
// the draft instead of as a surprise at the Queue.
const PLATFORMS: Platform[] = ['facebook', 'instagram', 'linkedin', 'gmb', 'youtube', 'tiktok'];
// Facebook alone by default, because the default has to be QUEUEABLE before anything is attached
// (zero-input value): a default that includes Instagram is a disabled button until a photo arrives.
// Instagram is one tap away and says "needs a photo" until it has one.
const DEFAULT_PLATFORMS: Platform[] = ['facebook'];
// Remembering her last choice is a per-browser convenience, never state — a missing or unreadable
// value falls back to the default and nothing is worse for it.
const platformKey = (worldId: string | null) => `re-platforms:${worldId ?? 'no-world'}`;
function rememberedPlatforms(worldId: string | null): Platform[] {
  try {
    const raw = localStorage.getItem(platformKey(worldId));
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    const ok = Array.isArray(arr) ? arr.filter((p): p is Platform => PLATFORMS.includes(p as Platform)) : [];
    return ok.length ? ok : DEFAULT_PLATFORMS;
  } catch { return DEFAULT_PLATFORMS; }
}

export function CampaignStudio({ worldId, onToast }: { worldId: string | null; onToast: Toast }) {
  const [pulse, setPulse] = useState<PulseState | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [facts, setFacts] = useState<FactWithSources[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [kind, setKind] = useState<DraftKind>('owner_brief');
  const [text, setText] = useState('');
  const [factIds, setFactIds] = useState<string[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [scheduleLocal, setScheduleLocal] = useState('');
  const [complianceLine, setComplianceLine] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [agentName, setAgentName] = useState('');
  const [busy, setBusy] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(() => rememberedPlatforms(worldId));
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([loadPulse(worldId, TZ), listCommunities(worldId)]);
      setPulse(p);
      setCommunities(c);
      setActiveId((prev) => prev ?? c[0]?.id ?? null);
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not read this workspace.');
      setPulse({ awaitingDecision: 0, nextScheduled: null, lastPublished: null, unansweredInquiries: 0, needsAttention: [] });
      setCommunities([]);
    }
  }, [worldId, onToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!activeId) { setFacts([]); return; }
    let live = true;
    listFacts(activeId)
      .then((f) => { if (live) setFacts(f); })
      .catch(() => { if (live) setFacts([]); });
    return () => { live = false; };
  }, [activeId]);

  const active = useMemo(() => communities?.find((c) => c.id === activeId) ?? null, [communities, activeId]);
  const now = useMemo(() => new Date().toISOString(), [facts]);
  const citableCount = useMemo(() => facts.filter((f) => citationBlocker(f, now) === '').length, [facts, now]);

  const schedule = useMemo(() => (scheduleLocal ? localToInstant(scheduleLocal, TZ) : null), [scheduleLocal]);
  const scheduleNote = schedule && schedule.ok ? scheduleCaveat(schedule) : (schedule && !schedule.ok ? schedule.reason : '');

  const onDraft = () => {
    if (!active) { onToast('info', 'Add a community first — a post has to be about somewhere.'); setSetupOpen(true); return; }
    const d = composeDraft({
      kind, communityName: active.name, facts,
      agentName: agentName.trim() || undefined,
      complianceLine: complianceLine.trim() || null,
      nowIso: now,
    });
    setText(d.text);
    setFactIds(d.factIds);
    setBlockers(d.blockers);
    if (d.blockers.length) onToast('info', `Drafted, with ${d.blockers.length} thing${d.blockers.length === 1 ? '' : 's'} to verify.`);
  };

  const onQueue = async () => {
    setBusy(true);
    try {
      const r = await queueDraft({
        text, platforms, mediaUrls: photoUrl ? [photoUrl] : [], worldId, factIds,
        complianceLine: complianceLine.trim() || null,
        scheduleLocal: scheduleLocal || null, scheduleTz: TZ,
        linkUrl: linkUrl.trim() || null,
      });
      for (const w of r.warnings) onToast('info', w);
      onToast('success', 'Sent to the Queue — it publishes only after you approve it there.');
      setText(''); setFactIds([]); setBlockers([]); setPhotoUrl(null);
      await refresh();
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not queue this.');
    } finally {
      setBusy(false);
    }
  };

  const hasHole = /\[VERIFY:/.test(text);
  // The same refusal the rail applies at queue time, shown under the draft so she never walks into
  // it: "Instagram needs an image or video — attach one or drop the platform."
  const gate = useMemo(
    () => checkDraft({ text, platforms, mediaUrls: photoUrl ? [photoUrl] : [] }, now),
    [text, platforms, photoUrl, now],
  );
  const canQueue = !!text.trim() && !hasHole && gate.ok && !busy && !uploading;

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      try { localStorage.setItem(platformKey(worldId), JSON.stringify(next)); } catch { /* convenience only */ }
      return next;
    });
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      setPhotoUrl(await uploadPostPhoto(file, worldId));
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-forge-border bg-forge-raised/40 p-4">
      {/* ---- title + chip strip (FactChannelStudio's shape) ---- */}
      <div className="flex items-center gap-2">
        <BookOpenCheck size={15} className="text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Campaign Studio</h3>
        <span className="text-[11px] text-forge-dim">verified facts → draft → your approval → scheduled → posted</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {communities === null && <Skeleton className="h-7 w-32" />}
        {communities?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={[
              'rounded-full border px-2.5 py-1 text-[11px] transition',
              c.id === activeId
                ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ink'
                : 'border-forge-border text-forge-dim hover:text-forge-ink',
            ].join(' ')}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSetupOpen((v) => !v)}
          className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink"
        >
          Community setup {setupOpen ? '▴' : '▾'}
        </button>
      </div>

      {setupOpen && <CommunitySetup worldId={worldId} activeId={activeId} onToast={onToast} onChanged={refresh} onFactsChanged={() => activeId && listFacts(activeId).then(setFacts).catch(() => {})} />}

      {/* ---- THE PULSE: useful before anything is typed ---- */}
      <div className="mt-4 rounded-xl border border-forge-border/70 bg-forge-panel/40 p-3">
        {pulse === null ? <Skeleton className="h-5 w-3/4" /> : <Pulse pulse={pulse} />}
      </div>

      {/* ---- ONE primary action ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" onClick={onDraft} disabled={busy}>
          <Plus size={15} />
          {active ? `Draft ${active.name} post` : 'Draft a post'}
        </Button>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as DraftKind)}
          className="rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 text-xs text-forge-ink"
          aria-label="What kind of post"
        >
          {DRAFT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <span className="text-[11px] text-forge-dim">
          {active
            ? `${citableCount} verified fact${citableCount === 1 ? '' : 's'} available${facts.length > citableCount ? ` · ${facts.length - citableCount} need checking` : ''}`
            : 'no community yet'}
        </span>
      </div>

      {/* ---- the draft ---- */}
      {text && (
        <div className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="w-full rounded-xl border border-forge-border bg-forge-panel p-3 text-sm text-forge-ink"
            aria-label="The draft post"
          />

          {blockers.length > 0 && (
            <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-forge-ink">
                <AlertTriangle size={14} className="text-forge-warn" />
                Verify these before this can publish
              </div>
              <ul className="mt-1.5 space-y-1 text-[11px] text-forge-dim">
                {blockers.map((b, i) => <li key={i}>· {b}</li>)}
              </ul>
            </div>
          )}

          {/* ---- the photo: one real picture, hers, digested into the approval ---- */}
          <div className="flex flex-wrap items-center gap-3">
            {photoUrl ? (
              <div className="flex items-center gap-2">
                <img src={photoUrl} alt="The photo attached to this post" className="h-14 w-14 rounded-lg border border-forge-border object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink"
                  aria-label="Remove the photo"
                >
                  <X size={12} /> Remove photo
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} className="text-forge-ember" />}
                {uploading ? 'Uploading…' : 'Add a photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Add a photo"
                  disabled={uploading}
                  onChange={(e) => { void onPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </label>
            )}
            <span className="text-[11px] text-forge-dim">
              {photoUrl
                ? 'Approval binds to this exact picture — swap it and the post needs a new decision.'
                : 'Instagram, TikTok and YouTube will not take a post without one.'}
            </span>
          </div>

          {/* ---- where it goes: real buttons, pressed state, refusal named below ---- */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Where to post">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              const needsPhoto = MEDIA_REQUIRED.includes(p) && !photoUrl;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePlatform(p)}
                  title={needsPhoto ? `${PLATFORM_LABEL[p]} needs a photo` : undefined}
                  className={[
                    'rounded-full border px-2.5 py-1 text-[11px] transition',
                    on ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
                    on && needsPhoto ? 'border-forge-warn/60' : '',
                  ].join(' ')}
                >
                  {PLATFORM_LABEL[p]}{on && needsPhoto ? ' · needs a photo' : ''}
                </button>
              );
            })}
          </div>
          {!gate.ok && gate.reason && <p className="text-[11px] text-forge-warn">{gate.reason}</p>}
          {gate.warnings.map((w) => <p key={w} className="text-[11px] text-forge-dim">⚠ {w}</p>)}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="A link in this post (optional)"
              className="w-72"
              aria-label="A link in this post"
            />
            <span className="text-[11px] text-forge-dim">
              {linkUrl.trim() && text.includes(linkUrl.trim())
                ? 'It will carry this post\u2019s tracking tag, so an inquiry through it names this post.'
                : 'Paste it into the post too — only a link that appears in the text gets tagged.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              value={scheduleLocal}
              onChange={(e) => setScheduleLocal(e.target.value.slice(0, 16))}
              className="w-56"
              aria-label="When to post (Central time)"
            />
            <span className="text-[11px] text-forge-dim">Central time — {scheduleLocal ? 'scheduled' : 'leave empty to post once approved'}</span>
          </div>
          {scheduleNote && <p className="text-[11px] text-forge-warn">{scheduleNote}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="md" onClick={() => void onQueue()} disabled={!canQueue}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send to the Queue
            </Button>
            {hasHole && <span className="text-[11px] text-forge-warn">Every [VERIFY: …] has to be filled or removed first.</span>}
            {!hasHole && text.trim() && gate.ok && <span className="text-[11px] text-forge-dim">Nothing posts until you approve it in the Queue.</span>}
          </div>
        </div>
      )}

      {/* ---- who signs it (optional, feeds the primary action directly) ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Who signs it" className="w-48" aria-label="Who signs the post" />
        <Input value={complianceLine} onChange={(e) => setComplianceLine(e.target.value)} placeholder="Brokerage line (required on every post)" className="w-80" aria-label="Brokerage compliance line" />
      </div>
    </div>
  );
}

function Pulse({ pulse }: { pulse: PulseState }) {
  const nothingYet = !pulse.awaitingDecision && !pulse.nextScheduled && !pulse.lastPublished && !pulse.unansweredInquiries;
  if (nothingYet) {
    return (
      <EmptyState
        icon={<BookOpenCheck size={18} className="text-forge-ember" />}
        title="Nothing has gone out yet"
        body="Add one community and one fact you have actually verified. That is enough to draft the first post."
      />
    );
  }
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-forge-dim">
          {pulse.awaitingDecision > 0
            ? <><Badge tone="ember">{pulse.awaitingDecision}</Badge> waiting on your decision in the Queue</>
            : 'Nothing waiting on your decision'}
        </span>
        <span className="text-forge-dim">
          {pulse.unansweredInquiries > 0
            ? <><Badge tone="warn">{pulse.unansweredInquiries}</Badge> inquir{pulse.unansweredInquiries === 1 ? 'y' : 'ies'} with no reply yet</>
            : 'No unanswered inquiries'}
        </span>
      </div>

      <p className="text-forge-dim">
        {pulse.nextScheduled
          ? <>Next out: <span className="text-forge-ink">{pulse.nextScheduled.whenLabel}</span> — “{pulse.nextScheduled.body.slice(0, 70)}{pulse.nextScheduled.body.length > 70 ? '…' : ''}”</>
          : 'Nothing scheduled.'}
      </p>

      {pulse.lastPublished && (
        <p className="flex flex-wrap items-center gap-2 text-forge-dim">
          {pulse.lastPublished.status === 'posted' && <CheckCircle2 size={13} className="text-forge-ok" />}
          Last out: “{pulse.lastPublished.body.slice(0, 60)}{pulse.lastPublished.body.length > 60 ? '…' : ''}”
          {pulse.lastPublished.url && (
            <a href={pulse.lastPublished.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-forge-ember hover:underline">
              see it <ExternalLink size={11} />
            </a>
          )}
          {/* No numbers means NO numbers — an absent metric is never rendered as a zero. */}
          <span className="text-forge-ink">{pulse.lastPublished.metrics ?? 'no numbers back yet'}</span>
        </p>
      )}

      {pulse.needsAttention.map((n, i) => (
        <p key={i} className="flex items-start gap-1.5 text-forge-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {n}
        </p>
      ))}
    </div>
  );
}

/** Set-once controls: a community, and a fact WITH its source. Closed by default. */
function CommunitySetup({ worldId, activeId, onToast, onChanged, onFactsChanged }: {
  worldId: string | null; activeId: string | null; onToast: Toast;
  onChanged: () => Promise<void>; onFactsChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [claim, setClaim] = useState('');
  const [value, setValue] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [quote, setQuote] = useState('');
  const [reviewedBy, setReviewedBy] = useState('');
  const [busy, setBusy] = useState(false);

  const addCommunity = async () => {
    setBusy(true);
    try {
      await createCommunity({ worldId, name, slug: name });
      setName('');
      await onChanged();
      onToast('success', 'Community added.');
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not add that community.');
    } finally { setBusy(false); }
  };

  const saveFact = async () => {
    if (!activeId) { onToast('info', 'Pick a community first.'); return; }
    setBusy(true);
    try {
      await addFact({ worldId, communityId: activeId, claim, valueText: value, sourceUrl, quote, reviewedBy });
      setClaim(''); setValue(''); setSourceUrl(''); setQuote('');
      onFactsChanged();
      onToast('success', 'Fact saved with its source.');
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not save that fact.');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-forge-border/70 bg-forge-panel/30 p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-forge-dim">Add a community</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Abbey Springs" className="w-56" aria-label="Community name" />
          <Button variant="outline" size="sm" onClick={() => void addCommunity()} disabled={busy || !name.trim()}>Add</Button>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-forge-dim">Add a verified fact</p>
        <p className="mt-0.5 text-[11px] text-forge-dim">
          A claim, what you actually verified, and where you verified it. Facts without a source cannot be published.
        </p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <Input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="What the fact is about (Association dues)" aria-label="The claim" />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="What you verified (billed quarterly)" aria-label="The verified value" />
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source link" aria-label="Source link" />
          <Input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="…or the line you read in the document" aria-label="Source quote" />
          <Input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Who checked it" aria-label="Who verified it" />
          <div>
            <Button variant="outline" size="sm" onClick={() => void saveFact()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save fact
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
