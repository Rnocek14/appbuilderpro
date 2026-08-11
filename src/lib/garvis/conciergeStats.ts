// src/lib/garvis/conciergeStats.ts
// THE STATS TIER's impure half: each stat answers from REAL rows — counted, summed, never
// estimated — in one or two cheap queries. A failed query returns an honest "couldn't read"
// line, never a fake number. Matching lives in concierge.ts (statsFor).

import { supabase } from '../supabase';
import { marketingReadiness } from './marketingReadiness';

export interface StatAnswer { text: string; link?: string }

/** The app-marketing template's slug signature — how portfolio worlds are recognized by
 *  STRUCTURE (same discipline as templateForWeb: slugs are identity, titles are editable). */
const MKT_SLUGS = ['mkt-plan', 'competitor-intel', 'seo-articles', 'social-posts', 'video-ideas', 'mkt-results'];

export async function answerStat(id: string): Promise<StatAnswer> {
  try {
    switch (id) {
      case 'approvals_waiting': {
        const { count, error } = await supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        if (error) throw error;
        return count === 0
          ? { text: 'Nothing is waiting on you — the Queue is clear.' }
          : { text: `${count} approval${count === 1 ? '' : 's'} waiting on you.`, link: '/garvis/queue' };
      }
      case 'episode_stats': {
        const { data, error } = await supabase.from('channel_episodes').select('id, status, post_id').order('created_at', { ascending: false }).limit(60);
        if (error) throw error;
        const eps = (data ?? []) as { id: string; status: string; post_id: string | null }[];
        if (!eps.length) return { text: 'No episodes yet — the studio drafts one in a press.', link: '/garvis/channels' };
        const posted = eps.filter((e) => e.status === 'posted');
        const postIds = posted.map((e) => e.post_id).filter(Boolean) as string[];
        let views = 0;
        if (postIds.length) {
          const { data: m } = await supabase.from('social_post_metrics').select('post_id, video_views').in('post_id', postIds.slice(0, 100)).limit(500);
          views = ((m ?? []) as { video_views: number | null }[]).reduce((s, r) => s + Number(r.video_views ?? 0), 0);
        }
        const drafts = eps.filter((e) => e.status === 'draft').length;
        return {
          text: `${posted.length} posted episode${posted.length === 1 ? '' : 's'} (${views.toLocaleString()} tracked views)${drafts ? `, ${drafts} draft${drafts === 1 ? '' : 's'} awaiting you` : ''} — the pulse has the trend.`,
          link: '/garvis/channels',
        };
      }
      case 'revenue_month': {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const { data, error } = await supabase.from('invoices').select('amount_usd, status, created_at').gte('created_at', monthStart.toISOString()).limit(500);
        if (error) throw error;
        const rows = (data ?? []) as { amount_usd: number; status: string }[];
        const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.amount_usd || 0), 0);
        const outstanding = rows.filter((r) => r.status === 'sent').reduce((s, r) => s + Number(r.amount_usd || 0), 0);
        return { text: `This month: $${paid.toLocaleString()} paid, $${outstanding.toLocaleString()} still out — counted from real invoices.`, link: '/garvis/money' };
      }
      case 'pipeline_count': {
        const { count, error } = await supabase.from('discovered_businesses').select('id', { count: 'exact', head: true });
        if (error) throw error;
        return count === 0
          ? { text: 'The pipeline is empty — one press on Prospects fills it.', link: '/garvis/leads' }
          : { text: `${count} prospect${count === 1 ? '' : 's'} in the pipeline.`, link: '/garvis/leads' };
      }
      case 'arcs_running': {
        const { data, error } = await supabase.from('orchestrator_plans').select('title, status').in('status', ['running', 'waiting', 'ready']).limit(6);
        if (error) throw error;
        const arcs = (data ?? []) as { title: string; status: string }[];
        return arcs.length === 0
          ? { text: 'No arcs in flight right now — say "do …" and I\'ll compile one.' }
          : { text: `In flight: ${arcs.map((a) => `"${a.title}" (${a.status})`).join(' · ')}.`, link: '/garvis/orchestrate' };
      }
      case 'portfolio': {
        const { data: cl, error } = await supabase.from('knowledge_clusters')
          .select('id, slug, title, world_id, knowledge_worlds!inner(title)').in('slug', MKT_SLUGS).limit(120);
        if (error) throw error;
        const clusters = (cl ?? []) as unknown as { id: string; slug: string; title: string; world_id: string; knowledge_worlds: { title: string } }[];
        if (!clusters.length) {
          return { text: 'No marketing operations stand yet — say "do start marketing <app name>" and I\'ll build the mapped operation.', link: '/garvis/orchestrate' };
        }
        const ids = clusters.map((c) => c.id);
        const { data: arts } = await supabase.from('knowledge_artifacts').select('cluster_id').in('cluster_id', ids).limit(2000);
        const countBy = new Map<string, number>();
        for (const a of (arts ?? []) as { cluster_id: string }[]) countBy.set(a.cluster_id, (countBy.get(a.cluster_id) ?? 0) + 1);
        const byWorld = new Map<string, { title: string; areas: { slug: string; title: string; artifacts: number }[] }>();
        for (const c of clusters) {
          const w = byWorld.get(c.world_id) ?? { title: c.knowledge_worlds?.title ?? 'Marketing op', areas: [] };
          w.areas.push({ slug: c.slug, title: c.title, artifacts: countBy.get(c.id) ?? 0 });
          byWorld.set(c.world_id, w);
        }
        const lines = [...byWorld.values()].map((w) => {
          const r = marketingReadiness({ areas: w.areas, ctaSet: null });
          return `${w.title}: ${r.pct}%${r.next.length ? ` — next: ${r.next[0].split(':')[0].toLowerCase()}` : ' — all areas worked'}`;
        });
        return { text: `Completeness, from real counts:\n${lines.join('\n')}\nOpen an operation for its full next-step list.`, link: '/garvis/webs' };
      }
      default:
        return { text: "I don't track that number yet." };
    }
  } catch {
    return { text: "I couldn't read that number right now — the page itself always shows the live truth." };
  }
}
