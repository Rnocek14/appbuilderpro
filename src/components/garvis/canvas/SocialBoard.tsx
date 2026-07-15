// src/components/garvis/canvas/SocialBoard.tsx
// The SOCIAL adapter for the creative board — the same spread-out workspace as postcards, but each tile
// is a platform-native post (Instagram / Facebook / LinkedIn / X). Pick a platform + a kind, Make a post
// (real gpt-image-1 imagery sized per platform, honest degrade), spread many out, spin renditions (a
// different platform or a restyled image), edit the caption/hashtags/image, then QUEUE it to the
// approval-gated publisher — the loop actually closes (unlike print). Plugs the social pipeline
// (socialBoard + SocialMock + socialRun) into the generic CreativeBoard shell.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Image as ImageIcon, Send, Copy } from 'lucide-react';
import { SocialMock } from './SocialMock';
import {
  socialKindsFor, socialKindById, defaultSocialKind, buildSocialContent, applySocialRendition,
  withPhoto, withGeneratedImage, tileAllowsAI, composeSocialText, PLATFORM_ORDER,
  type SocialContent, type SocialMaterials, type SocialPlatform,
} from '../../../lib/garvis/socialBoard';
import { loadSocialMaterials, generateSocialTileImage, queueSocialTile } from '../../../lib/garvis/socialBoardRun';
import { PLATFORM_LABEL } from '../../../lib/garvis/campaignCore';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;
const PLATFORM_EMOJI: Record<SocialPlatform, string> = { instagram: '📸', facebook: '👍', linkedin: '💼', x: '𝕏' };

export function SocialBoard({ worldId, clusterId, onToast, realEstate: reProp, materialsOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast;
  realEstate?: boolean; materialsOverride?: SocialMaterials;
}) {
  const [materials, setMaterials] = useState<SocialMaterials | null>(materialsOverride ?? null);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [aiState, setAiState] = useState<'unknown' | 'on' | 'off'>(materialsOverride ? 'off' : 'unknown');

  useEffect(() => {
    if (materialsOverride) { setMaterials(materialsOverride); return; }
    let live = true;
    void (async () => {
      try { const m = await loadSocialMaterials(worldId); if (live) setMaterials(m); }
      catch { if (live) setMaterials({ businessName: '', area: null, realEstate: !!reProp, accent: '#FF8A3D', avatarUrl: null, images: [] }); }
    })();
    return () => { live = false; };
  }, [worldId, materialsOverride, reProp]);

  const realEstate = reProp ?? materials?.realEstate ?? false;

  const adapter = useMemo<CreativeBoardAdapter<SocialContent> | null>(() => {
    if (!materials) return null;

    const tryImage = async (content: SocialContent, style: string | null): Promise<SocialContent> => {
      const r = await generateSocialTileImage({ content, materials, clusterId, style });
      if (r.ok) { setAiState('on'); return r.content; }
      if (r.kind === 'unavailable') { setAiState('off'); onToast('info', 'AI images aren’t connected yet — using your brand design. Connect an image key to generate photos.'); }
      else if (r.kind === 'error') onToast('error', r.message);
      return content;
    };

    return {
      storageKey: 'social',
      title: 'Social board',
      subtitle: 'Make posts for any platform — spread them out, compare, restyle, then queue to your publisher.',
      metrics: { w: 248, h: 320, gap: 26, cols: 3, pad: 40 },
      designWidth: 320,
      promptPlaceholder: realEstate ? 'an idea… e.g. “lakefront lifestyle, warm and aspirational”' : 'an idea… e.g. “bright, product-forward, friendly”',
      emptyHint: 'Pick a platform + a kind, type an idea, and hit Make. Your posts appear here — make as many as you like, compare, then queue the best.',
      kinds: socialKindsFor(realEstate).map((k) => ({ id: k.id, label: k.label, emoji: k.emoji, hint: k.hint })),
      banner: aiState === 'off'
        ? '🎨 AI imagery is off — the brand card is a preview, so these posts go out as text. Attach a photo, or connect an image key to generate + attach imagery.'
        : 'Real facts fill in; unknowns show as [EDIT] holes. Nothing posts from here — Queue sends it through Approvals first.',
      extraControls: (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] uppercase tracking-wide text-forge-dim">Platform</span>
          {PLATFORM_ORDER.map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={cn('cb-chip', platform === p && 'cb-chip-on')}>{PLATFORM_EMOJI[p]} {PLATFORM_LABEL[p]}</button>
          ))}
        </div>
      ),
      captionOf: (c) => `${PLATFORM_LABEL[c.platform]} · ${socialKindById(c.kindId)?.label ?? 'Post'}${c.imageMode === 'ai' ? ' · AI' : c.imageMode === 'photo' ? ' · photo' : ''}`,

      generate: async ({ prompt, kindId }) => {
        const kind = (kindId && socialKindById(kindId)) || defaultSocialKind(realEstate);
        let content = buildSocialContent({ materials, kind, platform });
        if (!kind.needsRealPhoto && tileAllowsAI(content) && aiState !== 'off') content = await tryImage(content, prompt || null);
        return content;
      },
      rendition: async ({ parent, instruction }) => {
        const r = applySocialRendition(parent, instruction);
        if (r.wantsImage && aiState !== 'off') return tryImage(r.content, r.imageStyle);
        return r.content;
      },

      renderThumb: (c) => (
        <SocialMock platform={c.platform} brandName={materials.businessName} caption={c.caption} hashtags={c.hashtags} accent={materials.accent} imageUrl={c.imageUrl} headline={c.headline} avatarUrl={materials.avatarUrl} />
      ),
      renderFocus: (c, api) => (
        <SocialFocus content={c} api={api} materials={materials} worldId={worldId} clusterId={clusterId} onToast={onToast} tryImage={tryImage} />
      ),
    };
  }, [materials, realEstate, platform, aiState, clusterId, worldId, onToast]);

  if (!materials || !adapter) {
    return <div className="grid h-full min-h-[400px] place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>;
  }
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

// ---- the focus/edit view for one post -----------------------------------------------------

function SocialFocus({ content, api, materials, worldId, clusterId, onToast, tryImage }: {
  content: SocialContent; api: FocusApi<SocialContent>; materials: SocialMaterials;
  worldId: string; clusterId: string | null; onToast: Toast;
  tryImage: (c: SocialContent, style: string | null) => Promise<SocialContent>;
}) {
  const [genBusy, setGenBusy] = useState(false);
  const [genStyle, setGenStyle] = useState('');
  const [pickPhoto, setPickPhoto] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const allowsAI = tileAllowsAI(content);
  const kind = socialKindById(content.kindId);

  const genImage = async () => {
    setGenBusy(true);
    try {
      const next = await tryImage(content, genStyle.trim() || null);
      // Apply ONLY the new image onto the latest content, so a caption/platform edit made while the
      // image was generating isn't clobbered by this (pre-generation) snapshot.
      if (next.imageMode === 'ai' && next.imageUrl) {
        const url = next.imageUrl, note = next.aiNote;
        api.update((prev) => withGeneratedImage(prev, url, note));
      }
    } finally { setGenBusy(false); }
  };

  const queue = async () => {
    setQueueBusy(true);
    try {
      const { warnings } = await queueSocialTile({ content, worldId });
      onToast('success', `Queued to ${PLATFORM_LABEL[content.platform]} — approve it in your Queue.${warnings.length ? ' (' + warnings[0] + ')' : ''}`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the post.'); }
    finally { setQueueBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(composeSocialText(content.platform, content.caption, content.hashtags)); onToast('success', 'Copied.'); }
    catch { onToast('info', 'Select the text and copy it.'); }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{PLATFORM_EMOJI[content.platform]} {PLATFORM_LABEL[content.platform]} · {kind?.label ?? 'Post'}</span>
        {content.imageMode === 'ai' && <span className="rounded-full bg-forge-ember/15 px-2 py-0.5 text-[10px] text-forge-ember">AI image</span>}
      </div>

      {/* platform switch */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLATFORM_ORDER.map((p) => (
          <button key={p} onClick={() => api.update({ ...content, platform: p })} className={cn('cb-chip', content.platform === p && 'cb-chip-on')}>{PLATFORM_EMOJI[p]} {PLATFORM_LABEL[p]}</button>
        ))}
      </div>

      <div className="rounded-xl bg-forge-bg/40 p-2"><SocialMock platform={content.platform} brandName={materials.businessName} caption={content.caption} hashtags={content.hashtags} accent={materials.accent} imageUrl={content.imageUrl} headline={content.headline} avatarUrl={materials.avatarUrl} /></div>
      {content.aiNote && <p className="mt-1 text-[10px] text-forge-dim/80">{content.aiNote}</p>}

      {/* image */}
      <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel/40 p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-forge-dim">The image</p>
        {allowsAI ? (
          <div className="flex items-center gap-2">
            <input value={genStyle} onChange={(e) => setGenStyle(e.target.value)} placeholder="describe it — e.g. golden hour, minimal, editorial"
              className="flex-1 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <Button variant="outline" size="sm" onClick={() => void genImage()} disabled={genBusy}>{genBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate</Button>
          </div>
        ) : (
          <p className="text-[11px] text-forge-dim">This is a listing post — it must show the <b>real home photo</b>, so pick one below.</p>
        )}
        {materials.images.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setPickPhoto((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-ember"><ImageIcon size={12} /> Use one of your photos ({materials.images.length})</button>
            {pickPhoto && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {materials.images.slice(0, 12).map((img) => (
                  <button key={img.url} onClick={() => api.update(withPhoto(content, img.url))} className="h-12 w-16 overflow-hidden rounded border border-forge-border hover:border-forge-ember">
                    <img src={img.url} alt={img.caption ?? ''} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* words */}
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">Caption</span>
          <textarea value={content.caption} onChange={(e) => api.update({ ...content, caption: e.target.value })} rows={Math.min(7, Math.max(3, Math.ceil(content.caption.length / 48)))}
            className="w-full resize-y rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">Hashtags</span>
          <input value={content.hashtags.join(' ')} onChange={(e) => api.update({ ...content, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
            className="w-full rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12.5px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        </label>
      </div>
      <p className="mt-1 text-[10px] text-forge-dim/80"><span className="text-forge-ember">[EDIT: …]</span> marks are yours to fill — Garvis never invents a fact.</p>

      {/* rendition */}
      <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel/40 p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-forge-dim">Another idea? Spin a rendition (keeps this one)</p>
        <RenditionInput onSpin={(t) => void api.rendition(t)} />
      </div>

      {/* actions — Queue closes the loop through Approvals */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void queue()} disabled={queueBusy}>{queueBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue to publisher</Button>
        <Button variant="outline" size="sm" onClick={() => void copy()}><Copy size={13} /> Copy</Button>
        <Button variant={api.isFavorite ? 'primary' : 'ghost'} size="sm" onClick={api.favorite}>{api.isFavorite ? '★ Starred' : '☆ Star'}</Button>
        <span className="text-[10.5px] text-forge-dim">Instagram needs an image — generate or attach one, or the queue will say so.</span>
      </div>
    </div>
  );
}

function RenditionInput({ onSpin }: { onSpin: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input value={t} onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && t.trim()) { onSpin(t); setT(''); } }}
        placeholder="warmer image · make a LinkedIn version · more minimal"
        className="flex-1 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
      <Button variant="outline" size="sm" disabled={!t.trim()} onClick={() => { onSpin(t); setT(''); }}><Sparkles size={13} /> Spin</Button>
    </div>
  );
}
