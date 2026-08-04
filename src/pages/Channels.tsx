// src/pages/Channels.tsx
// THE CHANNELS DOOR — the named daily entry the walkthrough found missing: the growth engine (the
// operator's main daily loop) lived behind More → Build → "Businesses" → open the right world. This
// hub answers "where do I go?" in one click from the Core nav: every world with a channel studio,
// its channels and their live pulse, and the one-click start when there are none. Opening a world
// lands on the studio itself — this page is a directory, not another workspace.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Loader2, Plus } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { instantiateWeb } from '../lib/garvis/workwebRun';
import { channelPulse } from '../lib/garvis/channelPulse';

interface ChannelRow { id: string; name: string; niche: string; created_at: string; world_id: string | null }
interface GrowthWorld { worldId: string; title: string; channels: ChannelRow[] }

export function Channels() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [worlds, setWorlds] = useState<GrowthWorld[] | null>(null);
  const [pulses, setPulses] = useState<Map<string, string>>(new Map());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      // Growth worlds = worlds holding a content_growth studio area.
      const { data: clusters } = await supabase.from('knowledge_clusters')
        .select('world_id, knowledge_worlds!inner(id, title)')
        .contains('charter', { archetype: 'studio', flavor: 'content_growth' })
        .limit(50);
      const byWorld = new Map<string, GrowthWorld>();
      for (const c of (clusters ?? []) as unknown as { world_id: string; knowledge_worlds: { id: string; title: string } }[]) {
        if (c.world_id && !byWorld.has(c.world_id)) {
          byWorld.set(c.world_id, { worldId: c.world_id, title: c.knowledge_worlds?.title ?? 'Untitled', channels: [] });
        }
      }
      if (byWorld.size) {
        const { data: chans } = await supabase.from('growth_channels')
          .select('id, name, niche, created_at, world_id')
          .in('world_id', [...byWorld.keys()]).limit(100);
        for (const ch of (chans ?? []) as ChannelRow[]) {
          if (ch.world_id) byWorld.get(ch.world_id)?.channels.push(ch);
        }
        // A light pulse line per channel: day N + streak from the posts' real dates.
        const chanIds = ((chans ?? []) as ChannelRow[]).map((c) => c.id);
        if (chanIds.length) {
          const { data: eps } = await supabase.from('channel_episodes')
            .select('channel_id, post_id').in('channel_id', chanIds).not('post_id', 'is', null).limit(400);
          const postIds = ((eps ?? []) as { post_id: string }[]).map((e) => e.post_id);
          const { data: posts } = postIds.length
            ? await supabase.from('social_posts').select('id, posted_at').in('id', postIds).limit(400)
            : { data: [] };
          const postedAt = new Map(((posts ?? []) as { id: string; posted_at: string | null }[])
            .filter((p) => p.posted_at).map((p) => [p.id, p.posted_at as string]));
          const p = new Map<string, string>();
          for (const ch of (chans ?? []) as ChannelRow[]) {
            const mine = ((eps ?? []) as { channel_id: string; post_id: string }[])
              .filter((e) => e.channel_id === ch.id)
              .map((e) => ({ postedAt: postedAt.get(e.post_id) ?? null, views: null }));
            p.set(ch.id, channelPulse(ch.created_at, mine, new Date().toISOString()).stats);
          }
          if (live) setPulses(p);
        }
      }
      if (live) setWorlds([...byWorld.values()]);
    })().catch(() => { if (live) setWorlds([]); });
    return () => { live = false; };
  }, []);

  const startOne = async () => {
    setCreating(true);
    try {
      const web = await instantiateWeb('content-channel');
      toast('success', 'Channel operation created — pick a channel preset inside.');
      navigate(`/garvis/webs/${web.worldId}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create it.');
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Clapperboard size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Channels</h1>
            <p className="text-sm text-forge-dim">Your content channels — the daily loop: draft, produce or film, approve, and let the numbers steer.</p>
          </div>
          <div className="ml-auto">
            <Button onClick={() => void startOne()} loading={creating}>
              <Plus size={14} /> Start a channel
            </Button>
          </div>
        </div>

        {worlds === null && <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</p>}

        {worlds?.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-forge-ink">No channel operation yet.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-forge-dim">
              One click sets up the whole line: cited scripts → illustrated + narrated 9:16 videos (or film them yourself from a shot list) → approval-gated posting → the learning loop reading views back into the next draft.
            </p>
            <div className="mt-4">
              <Button onClick={() => void startOne()} loading={creating}><Plus size={14} /> Start a channel</Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {worlds?.map((w) => (
            <button key={w.worldId} type="button" className="block w-full text-left" onClick={() => navigate(`/garvis/webs/${w.worldId}`)}>
            <Card interactive className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-forge-ink">{w.title}</p>
                  {w.channels.length
                    ? w.channels.map((ch) => (
                        <p key={ch.id} className="mt-0.5 text-xs text-forge-dim">
                          <span className="text-forge-ink">{ch.name}</span> · {ch.niche}
                          {pulses.get(ch.id) && <> · {pulses.get(ch.id)}</>}
                        </p>
                      ))
                    : <p className="mt-0.5 text-xs text-forge-dim">No channel created yet — open it and pick a preset (Caregiver / health, Finance facts…).</p>}
                </div>
                <span className="shrink-0 text-xs text-forge-ember">open the studio →</span>
              </div>
            </Card>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default Channels;
