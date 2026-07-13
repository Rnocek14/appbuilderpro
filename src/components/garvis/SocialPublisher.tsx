// src/components/garvis/SocialPublisher.tsx
// AUTO-POST to her real accounts. Write (or paste the studio's generated caption), pick platforms,
// attach an image, optionally schedule — then queue ONE approval. After you approve in the Queue,
// social-publish posts (or the provider schedules it) to her connected accounts. Honesty up front:
// a post a platform would reject (Instagram with no image, a past schedule time) refuses here;
// length overflows warn but don't block. Nothing posts without your approval.

import { useEffect, useMemo, useState } from 'react';
import { Share2, Loader2, Send, XCircle, Link2 } from 'lucide-react';
import { KNOWN_PLATFORMS, PLATFORM_LABEL, checkDraft, type Platform } from '../../lib/garvis/social';
import { queueSocialPost, listSocialPosts, cancelSocialPost, type SocialPostRow } from '../../lib/garvis/socialRun';
import { useConnections } from '../../hooks/useConnections';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

// The platforms a realtor actually uses, first.
const SHOWN: Platform[] = ['facebook', 'instagram', 'linkedin', 'gmb', 'twitter', 'youtube'];

export function SocialPublisher({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const { isConnected, startOAuth, loading: connLoading } = useConnections();
  const connected = isConnected('ayrshare');

  const [text, setText] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['facebook', 'instagram']);
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<SocialPostRow[]>([]);

  useEffect(() => {
    let live = true;
    void listSocialPosts().then((p) => { if (live) setPosts(p); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const draft = useMemo(() => ({
    text, platforms, mediaUrls: mediaUrl.trim() ? [mediaUrl.trim()] : [],
    scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
  }), [text, platforms, mediaUrl, scheduleAt]);
  const chk = useMemo(() => checkDraft(draft, new Date().toISOString()), [draft]);

  const toggle = (p: Platform) => setPlatforms((ps) => ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]);

  const doQueue = async () => {
    try {
      setBusy(true);
      const res = await queueSocialPost({ text, platforms, mediaUrls: draft.mediaUrls, scheduleAt: draft.scheduleAt, worldId });
      onToast('success', `Queued for approval${draft.scheduleAt ? ' — it posts at the scheduled time once approved' : ''}. Approve it in the Queue.`);
      setText(''); setMediaUrl(''); setScheduleAt('');
      setPosts(await listSocialPosts());
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the post.'); }
    finally { setBusy(false); }
  };

  const doCancel = async (p: SocialPostRow) => {
    try { await cancelSocialPost(p.id); setPosts(await listSocialPosts()); onToast('info', 'Post canceled.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not cancel.'); }
  };

  return (
    <div className="mt-4 space-y-4">
      {!connLoading && !connected && (
        <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3 text-xs text-forge-dim">
          <span className="text-forge-warn">No social accounts connected.</span> You can draft here now; to actually post,
          connect a provider — get a free Ayrshare API key, link her Facebook/Instagram/LinkedIn/Google Business accounts,
          and paste the key in{' '}
          <button onClick={() => void startOAuth('ayrshare').catch(() => onToast('info', 'Add the Ayrshare key in Settings → Connections.'))}
            className="text-forge-ember underline">Settings → Connections</button>. Free tier: 50 image posts/month.
        </div>
      )}

      <div className="rounded-xl border border-forge-border bg-forge-raised/30 p-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Share2 size={14} className="text-forge-ember" /> Post to her accounts</h4>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SHOWN.filter((p) => (KNOWN_PLATFORMS as readonly string[]).includes(p)).map((p) => (
            <button key={p} onClick={() => toggle(p)}
              className={cn('rounded-lg border px-2.5 py-1 text-xs', platforms.includes(p) ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
          placeholder="Write the post — or paste the caption from the social studio…"
          className="mt-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-forge-dim">
            <Link2 size={12} /> Image URL
            <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…/photo.jpg"
              className="w-52 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-forge-dim">
            Schedule (optional)
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          </label>
        </div>

        {(chk.warnings.length > 0 || (!chk.ok && (text || platforms.length))) && (
          <div className="mt-2 space-y-0.5">
            {!chk.ok && <p className="text-[11px] text-forge-warn">{chk.reason}</p>}
            {chk.warnings.map((w) => <p key={w} className="text-[11px] text-forge-dim">⚠ {w}</p>)}
          </div>
        )}

        <button onClick={() => void doQueue()} disabled={busy || !chk.ok}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {draft.scheduleAt ? 'Queue scheduled post (goes to Approvals)' : 'Queue post (goes to Approvals)'}
        </button>

        {posts.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-forge-border pt-2">
            {posts.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-forge-ink/80">{p.body || '(media only)'} · {p.platforms.join(', ')}</span>
                <span className={cn('shrink-0 rounded border px-1.5 py-0.5 uppercase tracking-wide',
                  p.status === 'posted' ? 'border-forge-ok/40 text-forge-ok'
                    : p.status === 'failed' ? 'border-forge-warn/40 text-forge-warn'
                      : p.status === 'scheduled' ? 'border-forge-cyan/40 text-forge-cyan'
                        : 'border-forge-border text-forge-dim')}>{p.status}</span>
                {p.status === 'queued' && (
                  <button onClick={() => void doCancel(p)} title="Cancel" className="shrink-0 text-forge-dim hover:text-forge-warn"><XCircle size={12} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
