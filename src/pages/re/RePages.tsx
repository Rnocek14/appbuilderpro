// src/pages/re/RePages.tsx
// The five rooms behind the real-estate door. Each one is a thin page over a component that already
// exists elsewhere in the platform — nothing is re-implemented, only re-housed where she can find it.

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2, Upload, Users } from 'lucide-react';
import { ReHeading, useReWorkspace } from './ReShell';
import { CampaignStudio } from '../../components/garvis/re/CampaignStudio';
import { BatchSendCard } from '../../components/garvis/BatchSendCard';
import { Button, EmptyState, Skeleton } from '../../components/ui';
import { listContacts, runTool, type ContactRow } from '../../lib/garvis/workwebRun';
import { timeAgo } from '../../lib/utils';

const Queue = lazy(() => import('../Queue'));
const MailerDesigner = lazy(() => import('../../components/garvis/MailerDesigner').then((m) => ({ default: m.MailerDesigner })));
const FarmPanel = lazy(() => import('../../components/garvis/FarmPanel').then((m) => ({ default: m.FarmPanel })));

const Loading = () => <div className="flex items-center gap-2 py-10 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Loading…</div>;

/** POST — the daily screen. The studio opens on the pulse, then one orange button. */
export function RePost() {
  const { worldId, toast } = useReWorkspace();
  return (
    <>
      <ReHeading title="Post" line="What's waiting, what's next, what went out — then draft the next one from verified facts." />
      <CampaignStudio worldId={worldId} onToast={toast} />
    </>
  );
}

/** QUEUE — the one room for decisions. The same Queue page, without the platform's shell around it. */
export function ReQueue() {
  return (
    <Suspense fallback={<Loading />}>
      <Queue embedded />
    </Suspense>
  );
}

/** NEWSLETTER — compose once, see who it can honestly reach, one approval. */
export function ReNewsletter() {
  const { toast } = useReWorkspace();
  return (
    <>
      <ReHeading title="Newsletter" line="Write it once. It goes to a segment of your people after you approve it in the Queue, under a daily cap." />
      <BatchSendCard onToast={toast} />
      <p className="mt-3 text-xs text-forge-dim">
        Sending needs email set up once — a Resend key, a verified sending domain, a from-address and a mailing address (the law requires it). The send card names whichever of those is missing.
      </p>
    </>
  );
}

/** POSTCARDS — the list decides who, the card decides what. It never mails; it hands the print shop
 *  a deduped, suppressed, USPS-correct PDF and CSV. */
export function RePostcards() {
  const { worldId, toast, clusterFor } = useReWorkspace();
  const cluster = clusterFor('postcards');
  return (
    <>
      <ReHeading title="Postcards & farming" line="Import the owner list you bought, see the honest go/no-go on the area, design the 6×9 card." />
      <Suspense fallback={<Loading />}>
        <FarmPanel worldId={worldId} onToast={toast} />
        <div className="mt-6">
          <MailerDesigner worldId={worldId} clusterId={cluster.id} onToast={toast} />
        </div>
      </Suspense>
    </>
  );
}

/** PEOPLE — everyone this workspace can reach, and the one way more of them get in: a CSV. */
export function RePeople() {
  const { worldId, toast, clusterFor } = useReWorkspace();
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try { setFailed(false); setRows(await listContacts(300, worldId)); }
    catch { setFailed(true); setRows([]); }
  }, [worldId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const onCsv = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const csvText = await file.text();
      // upload-list finds the email column itself, tolerates a header row, and NEVER overwrites a
      // known contact — someone who unsubscribed stays unsubscribed.
      const r = await runTool(worldId, clusterFor('inquiries'), 'upload-list', { csvText });
      toast(r.ok ? 'success' : 'error', r.message);
      if (r.ok) await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not import that file.');
    } finally { setImporting(false); }
  };

  return (
    <>
      <ReHeading title="People" line="Past clients, your sphere, everyone who asked. The newsletter goes to these people.">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ink hover:bg-forge-ember/20">
          {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="text-forge-ember" />}
          {importing ? 'Importing…' : 'Import a CSV'}
          <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Import a CSV of contacts" disabled={importing}
            onChange={(e) => { void onCsv(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>
      </ReHeading>
      <p className="mb-3 text-xs text-forge-dim">Any export with an email column works. Already-known people are skipped, never overwritten.</p>

      {rows === null ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
      ) : failed ? (
        <div className="rounded-xl border border-forge-err/30 bg-forge-err/10 p-4 text-sm text-forge-err">
          Couldn't load your people — a connection problem, not an empty list.{' '}
          <button type="button" onClick={() => void refresh()} className="underline">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users size={18} />} title="Nobody here yet" body="Import a CSV of your past clients — that is the whole audience the newsletter needs." />
      ) : (
        <ul className="divide-y divide-forge-border rounded-2xl border border-forge-border bg-forge-panel/40">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-forge-ink">{r.full_name ?? r.email}</span>
              {r.full_name && <span className="truncate text-xs text-forge-dim">{r.email}</span>}
              <span className="text-[11px] text-forge-dim">{r.email_status === 'unsubscribed' ? 'unsubscribed' : timeAgo(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-forge-dim">
          <span>{rows.length} {rows.length === 1 ? 'person' : 'people'}{rows.length === 300 ? ' shown (there may be more)' : ''}</span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>Refresh</Button>
        </div>
      )}
    </>
  );
}
