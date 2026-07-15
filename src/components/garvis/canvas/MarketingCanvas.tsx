// src/components/garvis/canvas/MarketingCanvas.tsx
// The marketing canvas, wired for real. The center holds what you're marketing; tapping it opens a
// short details sheet. Tapping a branch node opens a clean, focused sheet that MAKES that piece from
// the same real details (postcard, social, email) with renditions that branch off as satellites.
// The atmosphere (CanvasScene) is the "feels good" home; each sheet is the "dead simple" doing.
//
// Everything real: composeCampaign is deterministic and honest ([EDIT] holes for anything missing);
// posting queues an approval; the postcard you print/mail yourself; the people-nearby list is honest
// about needing a data source or a CSV. Nothing invents a number or a fact.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Loader2, X, Printer, Save, Upload, Sparkles, Copy, Send, CheckCircle2, Info,
  Play, Pause, Film, Clapperboard,
} from 'lucide-react';
import { CanvasScene, type CanvasNode, type Satellite } from './CanvasScene';
import { Overlay } from '../../ui/Overlay';
import {
  composeCampaign, campaignsFor, metaFor, PLATFORM_LABEL,
  type CampaignType, type CampaignInput, type CampaignSet, type SocialPost,
} from '../../../lib/garvis/campaignCore';
import { compileMailer, type MailerConcept, type MailerSpec } from '../../../lib/garvis/mailer';
import { PostcardViewer, PostcardFront, PostcardBack } from '../Postcard';
import { SocialMock, composePostText, providerPlatform } from './SocialMock';
import { buildImagePrompt, canGenerateImage } from '../../../lib/garvis/imagegen';
import { generateImageAsset } from '../../../lib/garvis/imagegenRun';
import { VIDEO_CONCEPTS, type Aspect, type Storyboard, type VideoConcept } from '../../../lib/garvis/storyboard';
import {
  loadVideoMaterials, defaultStoryboardFor, startRender, pollRender, saveStoryboard, saveRenderedVideo,
  type VideoMaterials,
} from '../../../lib/garvis/videoRun';
import {
  listTerritories, createTerritory, importRecipients, listRecipients, loadDoNotMailKeys, type TerritoryRow,
} from '../../../lib/garvis/farmRun';
import { parseFarmCsv, partitionMailable, farmMath, type FarmRecipient, type FarmParseResult } from '../../../lib/garvis/farm';
import { marketStats, type MlsRow } from '../../../lib/garvis/mlsStats';
import { supabase } from '../../../lib/supabase';
import { StudioPreviewFrame } from '../StudioPreviewFrame';
import { EmailStudio } from '../EmailStudio';
import { PostcardBoard } from './PostcardBoard';
import { SocialBoard } from './SocialBoard';
import { patchClusterWorkingState } from '../../../lib/garvis/clusterState';
import { getBrandKit, uploadClusterFile } from '../../../lib/garvis/artifacts';
import { loadWeb } from '../../../lib/garvis/workwebRun';
import { saveMailerDesign } from '../../../lib/garvis/mailerRun';
import { queueSocialPost } from '../../../lib/garvis/socialRun';
import type { MailerBrand } from '../../../lib/garvis/mailer';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;
type NodeKey = 'center' | 'postcard' | 'social' | 'email' | 'people' | 'video' | 'analysis';

// Rendition concepts to cycle when you "spin another" postcard — same real materials, a genuinely
// different design mechanism each time.
const CONCEPT_CYCLE: MailerConcept[] = ['proof', 'offer_first', 'local_authority', 'story', 'question', 'urgency'];

// The brand ember, as a concrete value for the JS-side rendering paths (postcard designer, video
// storyboard, image prompts) that can't read the --gv-ember CSS token. Kept in lockstep with it.
const DEFAULT_ACCENT = '#FF8A3D';

export function MarketingCanvas({ worldId, realEstate = false, onToast }: { worldId: string; realEstate?: boolean; onToast: Toast }) {
  const [targetCluster, setTargetCluster] = useState<string | null>(null);
  const [brand, setBrand] = useState<MailerBrand | null>(null);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [agent, setAgent] = useState('');
  const [phone, setPhone] = useState('');

  const [details, setDetails] = useState<CampaignInput | null>(null);
  const [bizName, setBizName] = useState('');
  const [open, setOpen] = useState<NodeKey | null>(null);
  const [sats, setSats] = useState<Satellite[]>([]);

  useEffect(() => {
    let live = true;
    void loadWeb(worldId).then(async (w) => {
      if (!live || !w) return;
      setBizName(w.title ?? '');
      const c = w.clusters.find((x) => x.charter?.flavor === 'direct_mail')
        ?? w.clusters.find((x) => x.charter?.archetype === 'studio') ?? w.clusters.find((x) => x.charter);
      const cid = c?.id ?? null;
      setTargetCluster(cid);
      // REHYDRATE the campaign you were working on — so reopening this business shows your real work,
      // not a blank "set up your announcement" every visit (the "it feels empty" complaint).
      if (cid) {
        try {
          const { data } = await supabase.from('knowledge_clusters').select('working_state').eq('id', cid).maybeSingle();
          const saved = (data?.working_state as { campaign?: CampaignInput } | null)?.campaign;
          if (live && saved?.type) {
            setDetails(saved);
            if (saved.agentName) setAgent((a) => a || saved.agentName!);
            if (saved.agentPhone) setPhone((p) => p || saved.agentPhone!);
          }
        } catch { /* first visit / no saved state — a blank canvas is correct then */ }
      }
    }).catch(() => {});
    void getBrandKit(worldId).then((k) => {
      if (!live || !k) return;
      setBrand({ palette: k.palette, fonts: k.fonts, compliance_line: k.compliance_line });
      if (k.palette?.[0]) setAccent(k.palette[0]);
      if (k.name) setAgent((a) => a || (k.name as string));
    }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const set = useMemo<CampaignSet | null>(() => (details ? composeCampaign(details) : null), [details]);
  const ready = !!details;

  const center = ready
    ? { kicker: metaFor(details!.type)?.label ?? 'Campaign', title: centerTitle(details!), sub: centerSub(details!), filled: true }
    : { kicker: bizName ? `Market ${bizName}` : 'Start here', title: 'Set up your first announcement', sub: 'tap to begin — takes a minute', filled: false };

  const nodes: CanvasNode[] = [
    { key: 'postcard', emoji: '📮', label: 'Postcards', sub: 'a board of ideas', dim: false },
    { key: 'social', emoji: '📱', label: 'Social posts', sub: 'post ideas', dim: false },
    { key: 'email', emoji: '✉️', label: 'Email', sub: 'ideas + examples', dim: false },
    { key: 'people', emoji: '📍', label: 'People nearby', sub: 'build a mail list', accent: 'violet' },
    { key: 'video', emoji: '🎬', label: 'Video', sub: 'a 30s reel' },
    { key: 'analysis', emoji: '📊', label: 'Market analysis', sub: realEstate ? "what's selling" : 'your numbers' },
  ];

  const addSat = (nodeKey: string) => setSats((s) => [...s, { nodeKey, id: `${nodeKey}-${s.length}-${(s.length * 7 + 3) % 97}` }]);

  const onOpen = (k: string) => {
    const key = k as NodeKey;
    // people + video + analysis + email work from the world's own data (a mail list, the world's
    // photos, the MLS, the brand), so they don't require the campaign details to be filled first.
    // The postcard board loads the world's own materials (brand, photos, context), so it — like the
    // other studios — opens straight to work without first filling the campaign details form.
    if (key !== 'center' && key !== 'people' && key !== 'video' && key !== 'analysis' && key !== 'email' && key !== 'social' && key !== 'postcard' && !ready) { setOpen('center'); return; }
    setOpen(key);
  };

  return (
    <div>
      <style>{SHEET_CSS}</style>
      <CanvasScene center={center} nodes={nodes} sats={sats} onOpen={onOpen} />

      {open === 'center' && (
        <DetailsSheet
          realEstate={realEstate} initial={details} agent={agent} phone={phone} brand={brand}
          targetCluster={targetCluster} onToast={onToast}
          onClose={() => setOpen(null)}
          onSave={(d) => {
            setDetails(d); setAgent(d.agentName ?? agent); setPhone(d.agentPhone ?? phone); setOpen(null);
            // Persist so it comes back next visit (rehydrated on mount) instead of resetting to blank.
            // MERGE — a raw column replace here would wipe working_state.boards (the postcard board).
            if (targetCluster) void patchClusterWorkingState(targetCluster, { campaign: d }).catch(() => {});
            onToast('success', 'Set — now open any node to make a piece.');
          }}
        />
      )}
      {open === 'postcard' && (
        <BoardOverlay title="Postcard board" onClose={() => setOpen(null)}>
          <PostcardBoard worldId={worldId} clusterId={targetCluster} realEstate={realEstate} onToast={onToast} />
        </BoardOverlay>
      )}
      {open === 'social' && (
        <BoardOverlay title="Social board" onClose={() => setOpen(null)}>
          <SocialBoard worldId={worldId} clusterId={targetCluster} realEstate={realEstate} onToast={onToast} />
        </BoardOverlay>
      )}
      {open === 'email' && (
        <Sheet emoji="✉️" title="Email" lead="Ideas + worked examples — pick one, spin the angle, edit, and save." onClose={() => setOpen(null)}>
          <EmailStudio worldId={worldId} clusterId={targetCluster} onToast={onToast} />
        </Sheet>
      )}
      {open === 'people' && (
        <PeopleSheet realEstate={realEstate} worldId={worldId} onToast={onToast} onClose={() => setOpen(null)} />
      )}
      {open === 'video' && (
        <VideoSheet worldId={worldId} clusterId={targetCluster}
          title={(details ? centerTitle(details) : agent) || 'Your business'}
          onToast={onToast} onClose={() => setOpen(null)} onSpin={() => addSat('video')} />
      )}
      {open === 'analysis' && (
        <AnalysisSheet realEstate={realEstate} area={details?.area ?? ''} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function centerTitle(d: CampaignInput): string {
  return (d.address || d.subject || d.area || 'Your announcement').trim();
}
function centerSub(d: CampaignInput): string {
  const bits = [d.price, [d.beds && `${d.beds} bd`, d.baths && `${d.baths} ba`].filter(Boolean).join(' · '), d.area]
    .map((x) => (x || '').trim()).filter(Boolean);
  return bits.join(' · ') || (d.details || '').trim();
}

// ---------- Board shell ----------
// A large, near-fullscreen dark surface that hosts a spatial creative board (the postcard board, and
// later social/branding). Unlike the cream paper Sheet, a board needs room to spread out, so it opens
// big and dark. Scrim + Escape + focus-trap all come from the shared Overlay primitive.
function BoardOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Overlay onClose={onClose} z={60}>
      <style>{`
        .mkc-board{width:min(96vw,1200px);height:88vh;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid var(--forge-border,#3a2f25);background:var(--forge-bg,#14100c);box-shadow:0 30px 80px rgba(0,0,0,.6)}
        .mkc-board-top{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--forge-border,#3a2f25);background:var(--forge-panel,#1c1710)}
        .mkc-board-top h3{font-size:14px;font-weight:600;color:var(--forge-ink,#f0e6da)}
        .mkc-board-body{flex:1;min-height:0}
      `}</style>
      <div className="mkc-board" role="dialog" aria-modal="true">
        <div className="mkc-board-top">
          <h3>{title}</h3>
          <button className="mkc-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mkc-board-body">{children}</div>
      </div>
    </Overlay>
  );
}

// ---------- Sheet shell ----------
// The cream paper sheet that opens over the night canvas. Scrim + Escape + focus-trap + scroll-lock
// all come from the shared Overlay primitive; this owns only the paper panel.
function Sheet({ emoji, title, lead, onClose, children }: { emoji: string; title: string; lead?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mkc-sheet" role="dialog" aria-modal="true">
        <div className="mkc-top">
          <span className="mkc-em">{emoji}</span>
          <h3>{title}</h3>
          <button className="mkc-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mkc-body">
          {lead && <p className="mkc-lead">{lead}</p>}
          {children}
        </div>
      </div>
    </Overlay>
  );
}

// ---------- Details ----------
function DetailsSheet({ realEstate, initial, agent, phone, brand, targetCluster, onToast, onClose, onSave }: {
  realEstate: boolean; initial: CampaignInput | null; agent: string; phone: string; brand: MailerBrand | null;
  targetCluster: string | null; onToast: Toast; onClose: () => void; onSave: (d: CampaignInput) => void;
}) {
  const types = campaignsFor(realEstate);
  const [type, setType] = useState<CampaignType | null>(initial?.type ?? types[0].id);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [beds, setBeds] = useState(initial?.beds ?? '');
  const [baths, setBaths] = useState(initial?.baths ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [details, setDetailsStr] = useState(initial?.details ?? '');
  const [highlight, setHighlight] = useState(initial?.highlight ?? '');
  const [openWhen, setOpenWhen] = useState(initial?.openWhen ?? '');
  const [agentName, setAgentName] = useState(initial?.agentName ?? agent);
  const [agentPhone, setAgentPhone] = useState(initial?.agentPhone ?? phone);
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const addPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) { onToast('error', 'Pick an image (JPG or PNG).'); return; }
    if (!targetCluster) { onToast('info', 'Photo upload needs a saved business; the card still works without one.'); return; }
    setUploading(true);
    try { const row = await uploadClusterFile(targetCluster, file); setPhotoUrl(row.url); onToast('success', 'Photo added.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not add the photo.'); }
    finally { setUploading(false); }
  };
  const [genning, setGenning] = useState(false);
  const genImage = async () => {
    if (!type) return;
    const built = buildImagePrompt({ campaignType: type, area, subject, businessName: agentName, highlight });
    if (!built.ok) { onToast('info', built.reason); return; }
    setGenning(true);
    try {
      const r = await generateImageAsset({ prompt: built.prompt, size: '1536x1024', clusterId: targetCluster, caption: built.note });
      if (!r.available) { onToast('info', 'AI images need an OpenAI key — set OPENAI_API_KEY in your project, then try again.'); return; }
      if (!r.ok || !r.url) { onToast('error', r.error || 'Could not generate the image.'); return; }
      setPhotoUrl(r.url); onToast('success', 'Image generated — an AI illustration, not a photo of a real place.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not generate the image.'); }
    finally { setGenning(false); }
  };

  const canSave = !!type && (!realEstate ? !!subject.trim() : type === 'find_sellers' ? !!area.trim() : !!address.trim());
  const save = () => {
    if (!type) return;
    onSave({
      type, brand, businessName: agentName || null, agentName: agentName || null, agentPhone: agentPhone || null,
      address: address || null, price: price || null, beds: beds || null, baths: baths || null, area: area || null,
      highlight: highlight || null, openWhen: openWhen || null, subject: subject || null, details: details || null,
      photoUrl, photoAlt: address || subject || area || null, link: null,
    });
  };

  const f = 'mkc-in';
  return (
    <Sheet emoji="✦" title="What are you announcing?" lead="Fill a couple of details — every node makes its piece from this." onClose={onClose}>
      <div className="mkc-chips">
        {types.map((t) => (
          <button key={t.id} onClick={() => setType(t.id)} className={cn('mkc-chip', type === t.id && 'on')}>
            <b>{t.label}</b><span>{t.blurb}</span>
          </button>
        ))}
      </div>
      <div className="mkc-form">
        {!realEstate ? (
          <>
            <label className="full">What are you announcing?<input className={f} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Our new fall menu · 20% off this weekend" /></label>
            <label className="full">The details<input className={f} value={details} onChange={(e) => setDetailsStr(e.target.value)} placeholder="Saturday 10–4 · $15 · while supplies last" /></label>
          </>
        ) : type === 'find_sellers' ? (
          <label className="full">Neighborhood / town<input className={f} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Lake Geneva" /></label>
        ) : (
          <>
            <label>Address<input className={f} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="48 Lakeshore Dr" /></label>
            <label>{type === 'just_sold' ? 'Sold price' : 'Price'}<input className={f} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$685,000" /></label>
            <label>Neighborhood<input className={f} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Lake Geneva" /></label>
            <div className="two"><label>Beds<input className={f} value={beds} onChange={(e) => setBeds(e.target.value)} placeholder="4" /></label><label>Baths<input className={f} value={baths} onChange={(e) => setBaths(e.target.value)} placeholder="3" /></label></div>
          </>
        )}
        {realEstate && type === 'open_house' && (
          <label className="full">Open house — when<input className={f} value={openWhen} onChange={(e) => setOpenWhen(e.target.value)} placeholder="Sat 1–3pm" /></label>
        )}
        <label className="full">{!realEstate ? 'Why it matters (optional)' : type === 'find_sellers' ? 'Your angle' : "What's special? (one line)"}<input className={f} value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder={realEstate ? 'Walk to the water · remodeled kitchen' : 'Fresh, local, made this morning'} /></label>
        {type && (
          <div className="full">
            <span style={{ fontSize: 12, color: 'var(--gv-paper-dim)' }}>{realEstate && type !== 'find_sellers' ? 'Photo of the home' : type === 'find_sellers' ? 'Lifestyle image (optional)' : 'Photo (optional)'}</span>
            <input ref={photoInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void addPhoto(fl); e.target.value = ''; }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
              {photoUrl && <img src={photoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover' }} />}
              {type !== 'find_sellers' && (
                <button type="button" className="mkc-spin" onClick={() => photoInput.current?.click()} disabled={uploading || genning}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {photoUrl ? 'Change photo' : 'Add a photo'}
                </button>
              )}
              {canGenerateImage(type) && (
                <button type="button" className="mkc-spin" onClick={() => void genImage()} disabled={uploading || genning}>
                  {genning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {photoUrl ? 'Regenerate with AI' : 'Generate an image'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gv-paper-faint)', marginTop: 6 }}>
              {canGenerateImage(type) ? 'AI images are lifestyle & brand pieces — clearly illustrations, never a specific property.' : 'Your real photo of the home — never stock, never AI.'}
            </div>
          </div>
        )}
        <label>Your name<input className={f} value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Jane Doe" /></label>
        <label>Your phone<input className={f} value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="(262) 555-0148" /></label>
      </div>
      <div className="mkc-acts">
        <button className="mkc-a pri" onClick={save} disabled={!canSave}><Sparkles size={15} /> Save &amp; explore</button>
      </div>
    </Sheet>
  );
}

// ---------- Postcard ----------
function PostcardSheet({ set, details, brand, accent, targetCluster, onToast, onClose, onSpin }: {
  set: CampaignSet; details: CampaignInput; brand: MailerBrand | null; accent: string;
  targetCluster: string | null; onToast: Toast; onClose: () => void; onSpin: () => void;
}) {
  // Renditions: the base postcard + concept-varied re-compiles from the SAME real materials, each
  // paired with a LOOK variant so spinning gives a visibly different design.
  const base = set.postcard;
  const [rends, setRends] = useState<{ spec: MailerSpec; variant: number }[]>([{ spec: base, variant: 0 }]);
  const [sel, setSel] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conceptRef = useRef(0);
  const spec = rends[sel]?.spec ?? base;
  const variant = rends[sel]?.variant ?? 0;

  useEffect(() => {
    const url = spec.back.qrUrl ?? spec.back.linkUrl;
    if (!url) { setQr(null); return; }
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 240 }).then((d) => { if (live) setQr(d); }).catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [spec.back.linkUrl, spec.back.qrUrl]);

  const spin = () => {
    conceptRef.current = (conceptRef.current + 1) % CONCEPT_CYCLE.length;
    const concept = CONCEPT_CYCLE[conceptRef.current];
    const next = compileMailer({
      ctx: { business_name: details.businessName || details.agentName || '', principal: details.agentName || null, craft: null,
        offerings: (details.subject || '').trim() ? [details.subject as string] : [], audience: details.area ? `${details.area} homeowners` : null,
        locale: details.area || null, links: {}, tone: null },
      brand, concept, imageUrl: details.photoUrl ?? null, imageAlt: base.front.imageAlt,
      offer: base.back.offer, headline: base.front.headline, phone: details.agentPhone ?? null,
    });
    setRends((r) => [...r, { spec: next, variant: r.length }]); setSel(rends.length); onSpin();
  };

  const savePc = async () => {
    if (!targetCluster) { onToast('info', 'Save works once this business has a studio to store it.'); return; }
    setBusy(true);
    try { await saveMailerDesign(targetCluster, spec, `${metaFor(set.type)?.label ?? 'Campaign'} postcard`); onToast('success', 'Postcard saved. Print it, or send to a mail vendor.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet emoji="📮" title="Postcard" lead="A real 6×9 card — flip it, print it, or spin a different look." onClose={onClose}>
      <style>{PRINT_CSS}</style>
      <div className="mkc-pcwrap">
        <div><PostcardViewer spec={spec} accent={accent} qr={qr} variant={variant} />
          <div className="mkc-print"><PostcardFront spec={spec} accent={accent} variant={variant} /><PostcardBack spec={spec} accent={accent} qr={qr} /></div>
        </div>
        <div className="mkc-side">
          <button className="mkc-a pri" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>
          <button className="mkc-a" onClick={() => void savePc()} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</button>
        </div>
      </div>
      <div className="mkc-rends">
        <div className="mkc-rlab">Renditions — same details, a different design</div>
        <div className="mkc-rrow">
          {rends.map((r, i) => (
            <button key={i} className={cn('mkc-rthumb', i === sel && 'sel')} onClick={() => setSel(i)} aria-label={`Rendition ${i + 1}`}>
              <div className="mkc-rthumb-in"><PostcardFront spec={r.spec} accent={accent} variant={r.variant} /></div>
            </button>
          ))}
          <button className="mkc-spin" onClick={spin}><Sparkles size={14} /> Spin another</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- Social ----------
function SocialSheet({ set, accent, photoUrl, brandName, worldId, onToast, onClose, onSpin }: {
  set: CampaignSet; accent: string; photoUrl: string | null; brandName: string; worldId: string; onToast: Toast; onClose: () => void; onSpin: () => void;
}) {
  const [posted, setPosted] = useState<Record<number, boolean>>({});
  const post = async (i: number, p: SocialPost) => {
    if (p.platform === 'instagram' && !photoUrl) { onToast('info', 'Instagram needs an image — add a photo in the details (or generate one) first.'); return; }
    try {
      const text = composePostText(p.platform, p.caption, p.hashtags);
      await queueSocialPost({ text, platforms: [providerPlatform(p.platform)], mediaUrls: photoUrl ? [photoUrl] : [], worldId });
      setPosted((s) => ({ ...s, [i]: true })); onSpin();
      onToast('success', `Queued for ${PLATFORM_LABEL[p.platform]} — approve it in the Queue and it posts.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the post.'); }
  };
  const copy = async (p: SocialPost) => {
    try { await navigator.clipboard.writeText(composePostText(p.platform, p.caption, p.hashtags)); onToast('success', 'Copied — ready to paste.'); }
    catch { onToast('info', 'Select and copy the text.'); }
  };
  return (
    <Sheet emoji="📱" title="Social posts" lead="One post tailored to each network — see it exactly as it'll look, then post (queues for your approval) or copy it." onClose={onClose}>
      <div className="mkc-socgrid">
        {set.socialPosts.map((p, i) => (
          <div key={i} className="mkc-soccard">
            <div className="mkc-socplat">{PLATFORM_LABEL[p.platform]}</div>
            <SocialMock platform={p.platform} brandName={brandName} caption={p.caption} hashtags={p.hashtags} accent={accent} imageUrl={photoUrl} headline={set.headline} />
            <div className="mkc-igbtns">
              <button className={cn('mkc-sbtn p', posted[i] && 'done')} onClick={() => void post(i, p)} disabled={posted[i]}>
                {posted[i] ? <><CheckCircle2 size={14} /> Queued</> : <><Send size={14} /> Post</>}
              </button>
              <button className="mkc-sbtn" onClick={() => void copy(p)}><Copy size={14} /> Copy</button>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- Email ----------
function EmailSheet({ set, accent, onToast, onClose }: { set: CampaignSet; accent: string; onToast: Toast; onClose: () => void }) {
  const copy = async () => { try { await navigator.clipboard.writeText(`Subject: ${set.email.subject}\n\n${set.email.body}`); onToast('success', 'Email copied.'); } catch { onToast('info', 'Select and copy the text.'); } };
  return (
    <Sheet emoji="✉️" title="Email" lead="Written from the same details — copy it into your email or a bulk send." onClose={onClose}>
      <p className="mkc-emsubj"><span>Subject</span> {set.email.subject}</p>
      <StudioPreviewFrame medium="email" content={set.email.body} accent={accent} />
      <div className="mkc-acts"><button className="mkc-a pri" onClick={() => void copy()}><Copy size={15} /> Copy email</button></div>
    </Sheet>
  );
}

// ---------- People nearby (the real farm: pick an area, build the list, see the honest reach) ----------
const VERDICT_COLOR: Record<string, string> = { strong: 'var(--gv-ok)', viable: 'var(--gv-ok)', thin: 'var(--gv-warn)', dont: 'var(--gv-err)', unknown: 'var(--gv-paper-dim)' };

function PeopleSheet({ realEstate, worldId, onToast, onClose }: { realEstate: boolean; worldId: string; onToast: Toast; onClose: () => void }) {
  const [terrs, setTerrs] = useState<TerritoryRow[]>([]);
  const [sel, setSel] = useState<TerritoryRow | null>(null);
  const [newName, setNewName] = useState('');
  const [recips, setRecips] = useState<FarmRecipient[] | null>(null);
  const [dnm, setDnm] = useState<ReadonlySet<string>>(new Set());
  const [parsed, setParsed] = useState<FarmParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [piece, setPiece] = useState('0.73');
  const [drops, setDrops] = useState('4');
  const [sold, setSold] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  useEffect(() => {
    void listTerritories(worldId).then(setTerrs).catch(() => {});
    void loadDoNotMailKeys().then(setDnm).catch(() => {});
  }, [worldId]);

  const selectTerr = async (t: TerritoryRow) => {
    setSel(t); setParsed(null); setRecips(null);
    try { setRecips(await listRecipients(t.id)); } catch { setRecips([]); }
  };
  const createT = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try { const t = await createTerritory({ worldId, name: newName.trim() }); setTerrs((a) => [t, ...a]); setNewName(''); await selectTerr(t); onToast('success', `Area “${t.name}” created — now add households.`); }
    catch (e) { onToast('error', emsg(e)); }
    finally { setBusy(false); }
  };
  const onCsv = async (file: File) => {
    try { const res = parseFarmCsv(await file.text()); setParsed(res); if (!res.recipients.length) onToast('info', 'No usable addresses found in that file.'); }
    catch (e) { onToast('error', emsg(e)); }
  };
  const doImport = async () => {
    if (!sel || !parsed) return;
    setBusy(true);
    try {
      const r = await importRecipients({ territoryId: sel.id, worldId, recipients: parsed.recipients });
      onToast('success', `Imported ${r.inserted} address${r.inserted === 1 ? '' : 'es'}${r.skippedExisting ? ` (${r.skippedExisting} already on file)` : ''}.`);
      setParsed(null); setRecips(await listRecipients(sel.id));
    } catch (e) { onToast('error', emsg(e)); }
    finally { setBusy(false); }
  };

  const reach = recips ? partitionMailable(recips, dnm) : null;
  const homes = recips?.length ?? 0;
  const absentee = recips?.filter((r) => r.isAbsentee).length ?? 0;
  const math = farmMath({ homes, pieceCostUsd: parseFloat(piece) || 0, dropsPerYear: parseInt(drops, 10) || 0, soldLast12: sold.trim() ? (parseInt(sold, 10) || 0) : null });

  return (
    <Sheet emoji="📍" title="People nearby" lead="Pick an area, build the mailing list, and see exactly how many real households will get a postcard." onClose={onClose}>
      <div className="mkc-vlabel">Your areas</div>
      <div className="mkc-terrs">
        {terrs.map((t) => <button key={t.id} className={cn('mkc-vchip', sel?.id === t.id && 'on')} onClick={() => void selectTerr(t)}>{t.name}</button>)}
        <span className="mkc-terrnew">
          <input className="mkc-in" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={realEstate ? 'New area (e.g. Maple Grove)' : 'New area to reach'} onKeyDown={(e) => { if (e.key === 'Enter') void createT(); }} />
          <button className="mkc-spin" onClick={() => void createT()} disabled={busy || !newName.trim()}>+ Add</button>
        </span>
      </div>

      {sel ? (
        <>
          <div className="mkc-reach">
            <div className="mkc-reachbig"><b>{reach ? reach.mailable.length.toLocaleString() : '—'}</b> will get mail</div>
            <div className="mkc-reachsub">{homes.toLocaleString()} household{homes === 1 ? '' : 's'} · {absentee.toLocaleString()} absentee{reach && reach.suppressed.length ? ` · ${reach.suppressed.length} held back (do-not-mail / incomplete address)` : ''}</div>
          </div>

          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onCsv(f); e.target.value = ''; }} />
          {!parsed ? (
            <button className="mkc-spin" onClick={() => fileRef.current?.click()}><Upload size={14} /> Add households from a CSV</button>
          ) : (
            <div className="mkc-parse">
              <div><b>{parsed.recipients.length.toLocaleString()}</b> addresses ready{parsed.duplicatesInFile ? ` · ${parsed.duplicatesInFile} duplicates removed` : ''}{parsed.rejected.length ? ` · ${parsed.rejected.length} rows skipped (incomplete)` : ''}</div>
              <div className="mkc-parsesub">{parsed.mailingDataPresent ? 'Owner mailing addresses detected — absentee owners flagged.' : 'No mailing-address column — absentee status unknown (not zero).'}</div>
              <div className="mkc-igbtns">
                <button className="mkc-a pri" onClick={() => void doImport()} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Import {parsed.recipients.length.toLocaleString()}</button>
                <button className="mkc-a" onClick={() => setParsed(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="mkc-vlabel">Cost &amp; fit</div>
          <div className="mkc-costrow">
            <label>$ / piece<input className="mkc-in" value={piece} onChange={(e) => setPiece(e.target.value)} /></label>
            <label>Drops / yr<input className="mkc-in" value={drops} onChange={(e) => setDrops(e.target.value)} /></label>
            {realEstate && <label>Sold last 12mo<input className="mkc-in" value={sold} onChange={(e) => setSold(e.target.value)} placeholder="from MLS" /></label>}
          </div>
          <div className="mkc-verdict" style={{ borderColor: VERDICT_COLOR[math.verdict] }}>
            <span className="mkc-vdot" style={{ background: VERDICT_COLOR[math.verdict] }} />{math.line}
          </div>

          <div className="mkc-note">
            <Info size={15} />
            <div>Households come from a CSV you export (PropertyRadar / Cole / county) — Garvis de-dupes and honors do-not-mail before anything prints, and never invents an address. Print the addressed run in <b>Advanced → Farm</b> (it uses this exact list under the same gate).</div>
          </div>
        </>
      ) : (
        <div className="mkc-note"><Info size={15} /><div>No area selected yet — name your first {realEstate ? 'neighborhood' : 'area'} above, then add households from a CSV.</div></div>
      )}
    </Sheet>
  );
}

// ---------- Video ----------
const KEN: Record<string, string> = { zoomIn: 'vsk-zin', zoomOut: 'vsk-zout', panLeft: 'vsk-pl', panRight: 'vsk-pr', still: '' };
const V_ASPECTS: { id: Aspect; label: string; ratio: string; max: number }[] = [
  { id: '9:16', label: 'Reel', ratio: '9 / 16', max: 250 },
  { id: '1:1', label: 'Square', ratio: '1 / 1', max: 320 },
  { id: '16:9', label: 'Landscape', ratio: '16 / 9', max: 460 },
];

function VideoSheet({ worldId, clusterId, title, onToast, onClose, onSpin }: {
  worldId: string; clusterId: string | null; title: string; onToast: Toast; onClose: () => void; onSpin: () => void;
}) {
  const [materials, setMaterials] = useState<VideoMaterials | null>(null);
  const [sb, setSb] = useState<Storyboard | null>(null);
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [concept, setConcept] = useState<VideoConcept>('proof_first');
  const [playing, setPlaying] = useState(false);
  const [scene, setScene] = useState(0);
  const [busy, setBusy] = useState(false);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true, done = false;
    const seed = (m: VideoMaterials) => { if (live && !done) { done = true; setMaterials(m); setSb(defaultStoryboardFor(m, title, aspect, concept)); } };
    void loadVideoMaterials(worldId).then(seed).catch(() => seed({ ctx: null, accent: DEFAULT_ACCENT, photos: [] }));
    // Never trap on the spinner: if materials don't load quickly, seed a card-only board so the
    // sheet is usable (photo-less scenes show the shot to film — honest, never fake footage).
    const fb = setTimeout(() => seed({ ctx: null, accent: DEFAULT_ACCENT, photos: [] }), 5000);
    return () => { live = false; clearTimeout(fb); };
  }, [worldId, title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !sb || !sb.scenes.length) return;
    timer.current = setTimeout(() => {
      setScene((i) => { if (i + 1 >= sb.scenes.length) { setPlaying(false); return 0; } return i + 1; });
    }, (sb.scenes[scene]?.durationS ?? 3) * 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, scene, sb]);

  const pickCut = (c: VideoConcept) => { if (!materials || c === concept) return; setConcept(c); setSb(defaultStoryboardFor(materials, title, aspect, c)); setScene(0); setPlaying(false); };
  const pickAspect = (a: Aspect) => { if (!materials) return; setAspect(a); setSb(defaultStoryboardFor(materials, title, a, concept)); setScene(0); };

  const doRender = async () => {
    if (!sb) return;
    setBusy(true); setRenderMsg('Starting render…');
    try {
      const start = await startRender(sb);
      if (start.available === false) { setRenderMsg(null); onToast('info', 'Video rendering isn’t set up on the server yet — the preview here is fully usable. (Add a render key in Settings.)'); return; }
      if (!start.ok || !start.id) { setRenderMsg(null); onToast('error', start.error ?? 'Render could not start.'); return; }
      if (clusterId) await saveStoryboard(clusterId, sb).catch(() => {});
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollRender(start.id);
        setRenderMsg(`Rendering… (${st.status ?? 'working'})`);
        if (st.status === 'done' && st.url) {
          if (clusterId) await saveRenderedVideo(clusterId, sb.title, st.url).catch(() => {});
          setRenderMsg(null); onSpin(); onToast('success', 'Video rendered — saved to this world.'); window.open(st.url, '_blank'); return;
        }
        if (st.status === 'failed') { setRenderMsg(null); onToast('error', 'The render failed on the provider.'); return; }
      }
      setRenderMsg(null); onToast('info', 'Render is taking longer than expected — it’ll appear in your world when done.');
    } catch (e) { setRenderMsg(null); onToast('error', e instanceof Error ? e.message : 'Render failed.'); }
    finally { setBusy(false); }
  };

  const asp = V_ASPECTS.find((a) => a.id === aspect)!;
  const cur = sb?.scenes[scene];
  return (
    <Sheet emoji="🎬" title="Video" lead="A 30-second reel from your photos — it plays here now; render a real MP4 when you want the file." onClose={onClose}>
      <style>{VIDEO_CSS}</style>
      {!sb ? (
        <div className="mkc-vloading"><Loader2 size={15} className="animate-spin" /> Loading your photos…</div>
      ) : (
        <div className="mkc-vwrap">
          <div className="mkc-vplayer">
            <div className="mkc-vframe" style={{ aspectRatio: asp.ratio, maxWidth: asp.max }}>
              {cur?.imageUrl ? (
                <img key={scene} src={cur.imageUrl} alt="" className={cn('mkc-vimg', playing && KEN[cur.motion])} style={playing ? { animationDuration: `${cur.durationS}s` } : undefined} />
              ) : (
                <div className="mkc-vcard">{cur?.shoot ?? 'Add photos to your world to fill this scene'}</div>
              )}
              {cur?.onScreen && <div className="mkc-vcap"><span style={{ color: sb.accent }}>{cur.onScreen}</span></div>}
              <div className="mkc-vdots">{sb.scenes.map((_, i) => <span key={i} className={i <= scene ? 'on' : ''} />)}</div>
            </div>
            <div className="mkc-vctrl">
              <button className="mkc-a pri" onClick={() => { setScene(0); setPlaying((p) => !p); }}>{playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}</button>
              <span className="mkc-vmeta">{sb.totalDurationS}s · {sb.scenes.length} scenes</span>
            </div>
          </div>
          <div className="mkc-vside">
            <div className="mkc-vlabel">Cut — same photos, a different story</div>
            <div className="mkc-vchips">{VIDEO_CONCEPTS.map((c) => <button key={c.id} className={cn('mkc-vchip', concept === c.id && 'on')} onClick={() => pickCut(c.id)}>{c.label}</button>)}</div>
            <div className="mkc-vlabel">Shape</div>
            <div className="mkc-vchips">{V_ASPECTS.map((a) => <button key={a.id} className={cn('mkc-vchip', aspect === a.id && 'on')} onClick={() => pickAspect(a.id)}>{a.label}</button>)}</div>
            <div className="mkc-acts">
              <button className="mkc-a pri" onClick={() => void doRender()} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />} Render MP4</button>
            </div>
            {renderMsg && <p className="mkc-vmsg"><Clapperboard size={12} /> {renderMsg}</p>}
            <p className="mkc-vnote">The preview plays your real photos with motion + captions — usable now. Render makes a downloadable MP4 when a render key is set. Photo-less scenes show the shot to film — never fake footage.</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Market analysis (real MLS numbers, never guessed) ----------
function AnalysisSheet({ realEstate, area, onClose }: { realEstate: boolean; area: string; onClose: () => void }) {
  const [rows, setRows] = useState<MlsRow[] | null>(null);
  const [zip, setZip] = useState('');
  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    if (!realEstate) { setRows([]); return; }
    let live = true;
    const done = (r: MlsRow[]) => { if (live) { live = false; setRows(r); } };
    void supabase.from('mls_listings')
      .select('listing_key, status, list_price, close_price, address1, city, zip, property_type, beds, baths, sqft, list_date, close_date, dom')
      .order('modified_at', { ascending: false }).limit(5000)
      .then(({ data }) => done((data ?? []) as MlsRow[]), () => done([]));
    // Never trap on the spinner — fall to the honest empty state if the read stalls.
    const fb = setTimeout(() => done([]), 5000);
    return () => { live = false; clearTimeout(fb); };
  }, [realEstate]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const z = zip.trim().slice(0, 5);
    return z.length >= 3 ? rows.filter((r) => r.zip.startsWith(z)) : rows;
  }, [rows, zip]);
  const stats = useMemo(() => (filtered.length ? marketStats(filtered, nowIso) : null), [filtered, nowIso]);
  const money = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString('en-US')}`);

  if (!realEstate) {
    return (
      <Sheet emoji="📊" title="Market analysis" lead="Real numbers from your own data — never guessed." onClose={onClose}>
        <div className="mkc-note"><Info size={15} /><div>Market analysis here reads a real-estate MLS feed. For your business, the numbers that matter live in your own data (sales, bookings, site traffic) — connect a source in <b>Advanced</b> and Garvis reads from it. It never makes a number up.</div></div>
      </Sheet>
    );
  }
  return (
    <Sheet emoji="📊" title="Market analysis" lead="Every number is computed from your MLS listings — never remembered, never guessed." onClose={onClose}>
      {rows === null ? (
        <div className="mkc-vloading"><Loader2 size={15} className="animate-spin" /> Reading your MLS…</div>
      ) : rows.length === 0 ? (
        <div className="mkc-note"><Info size={15} /><div>No MLS data yet. Connect your MLS / RESO feed in <b>Advanced → Market data</b> and Garvis pulls active + sold listings; every stat here is then computed from those real rows.</div></div>
      ) : (
        <>
          <div className="mkc-locrow2">
            <input className="mkc-in" value={zip} onChange={(e) => setZip(e.target.value)} placeholder={`ZIP to focus${area ? ` on ${area}` : ''} (or leave blank for all ${rows.length.toLocaleString()})`} />
            <span className="mkc-vmeta">{filtered.length.toLocaleString()} listings</span>
          </div>
          {stats ? (
            <>
              <div className="mkc-stats">
                <Stat label="Active" value={stats.activeCount.toLocaleString()} />
                <Stat label="Sold · 12 mo" value={stats.soldLast12.toLocaleString()} />
                <Stat label="Median close" value={money(stats.medianClose)} />
                <Stat label="Median days on market" value={stats.medianDom != null ? `${stats.medianDom} days` : null} />
                <Stat label="Price / sqft" value={money(stats.medianPricePerSqft)} />
                <Stat label="Months of supply" value={stats.monthsOfSupply != null ? String(stats.monthsOfSupply) : null} />
              </div>
              {stats.notes.length > 0 && (
                <div className="mkc-anote">{stats.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
              )}
            </>
          ) : (
            <div className="mkc-note"><Info size={15} /><div>No listings match that ZIP yet — clear it to see the whole feed.</div></div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** A KPI tile. A null value shows an honest "not enough data" — never a smoothed-over number. */
function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mkc-stat">
      <div className="mkc-statv" style={value == null ? { color: 'var(--gv-paper-faint)', fontSize: 13, fontWeight: 500 } : undefined}>{value ?? 'not enough data'}</div>
      <div className="mkc-statl">{label}</div>
    </div>
  );
}

const PRINT_CSS = `.mkc-print{ display:none; }
@media print{ body *{ visibility:hidden !important; } .mkc-print,.mkc-print *{ visibility:visible !important; } .mkc-print{ display:block !important; position:absolute; left:0; top:0; width:100%; }
  .mailer-card{ page-break-after:always; box-shadow:none !important; } @page{ size:9.25in 6.25in; margin:0; } }`;

const VIDEO_CSS = `
@keyframes vskZin{ from{ transform:scale(1) } to{ transform:scale(1.15) } }
@keyframes vskZout{ from{ transform:scale(1.15) } to{ transform:scale(1) } }
@keyframes vskPl{ from{ transform:scale(1.12) translateX(3%) } to{ transform:scale(1.12) translateX(-3%) } }
@keyframes vskPr{ from{ transform:scale(1.12) translateX(-3%) } to{ transform:scale(1.12) translateX(3%) } }
.vsk-zin{ animation:vskZin linear both } .vsk-zout{ animation:vskZout linear both }
.vsk-pl{ animation:vskPl linear both } .vsk-pr{ animation:vskPr linear both }
.mkc-vloading{ display:flex; align-items:center; gap:8px; color:var(--gv-paper-dim); font-size:14px; padding:8px 0; }
.mkc-vwrap{ display:grid; grid-template-columns:auto 1fr; gap:18px; align-items:start; }
.mkc-vplayer{ display:flex; flex-direction:column; gap:9px; }
.mkc-vframe{ position:relative; width:100%; overflow:hidden; border-radius:14px; background:#000; box-shadow:0 10px 30px -12px rgba(0,0,0,.5); }
.mkc-vimg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.mkc-vcard{ position:absolute; inset:0; display:grid; place-items:center; padding:10%; text-align:center; font-size:12px; color:var(--gv-night-dim2); background:var(--gv-night-orb); }
.mkc-vcap{ position:absolute; inset-inline:0; bottom:0; padding:16px 12px 12px; background:linear-gradient(to top, rgba(0,0,0,.82), transparent); }
.mkc-vcap span{ font-size:14px; font-weight:700; line-height:1.15; }
.mkc-vdots{ position:absolute; inset-inline:0; top:6px; display:flex; gap:4px; padding:0 8px; }
.mkc-vdots span{ height:2px; flex:1; border-radius:99px; background:rgba(255,255,255,.28); }
.mkc-vdots span.on{ background:rgba(255,255,255,.85); }
.mkc-vctrl{ display:flex; align-items:center; gap:10px; justify-content:center; }
.mkc-vmeta{ font-size:11px; color:var(--gv-paper-dim); }
.mkc-vside{ display:flex; flex-direction:column; gap:8px; }
.mkc-vmsg{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--gv-paper-dim); }
.mkc-vnote{ font-size:11px; color:var(--gv-paper-faint); line-height:1.5; }
@media (max-width:560px){ .mkc-vwrap{ grid-template-columns:1fr; } }
`;

const SHEET_CSS = `
.mkc-sheet{ width:min(660px,100%); max-height:90vh; overflow:auto; background:var(--gv-paper); color:var(--gv-paper-ink); border-radius:20px; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); animation:mkc-rise .22s cubic-bezier(.2,.7,.2,1); }
@keyframes mkc-rise{ from{ transform:translateY(14px) scale(.98); opacity:0 } to{ transform:none; opacity:1 } }
.mkc-top{ position:sticky; top:0; z-index:2; display:flex; align-items:center; gap:10px; padding:15px 18px; background:var(--gv-paper); border-bottom:1px solid var(--gv-paper-line2); }
.mkc-top .mkc-em{ font-size:21px; } .mkc-top h3{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:19px; margin:0; font-weight:600; }
.mkc-x{ margin-left:auto; border:none; background:none; cursor:pointer; color:var(--gv-paper-dim); width:32px; height:32px; border-radius:9px; display:grid; place-items:center; }
.mkc-x:hover{ background:var(--gv-paper-line2); color:var(--gv-paper-ink); }
.mkc-body{ padding:18px; }
.mkc-lead{ margin:0 0 16px; color:var(--gv-paper-dim); font-size:14px; }

.mkc-chips{ display:flex; flex-wrap:wrap; gap:9px; margin-bottom:16px; }
.mkc-chip{ cursor:pointer; text-align:left; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); border-radius:12px; padding:10px 13px; min-width:150px; }
.mkc-chip b{ display:block; font-size:14px; font-weight:600; } .mkc-chip span{ font-size:11.5px; color:var(--gv-paper-dim); }
.mkc-chip.on{ border-color:var(--gv-ember-deep); background:var(--gv-paper-tint); box-shadow:0 0 0 1px var(--gv-ember-deep) inset; }
.mkc-form{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.mkc-form label{ font-size:12px; color:var(--gv-paper-dim); display:flex; flex-direction:column; gap:5px; }
.mkc-form .full{ grid-column:1/-1; } .mkc-form .two{ grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.mkc-in{ font:inherit; font-size:14px; color:var(--gv-paper-ink); background:var(--gv-paper-raised); border:1px solid var(--gv-paper-line); border-radius:10px; padding:10px 12px; }
.mkc-in:focus-visible{ outline:2px solid var(--gv-ember-deep); outline-offset:1px; border-color:var(--gv-ember-deep); }

.mkc-acts{ display:flex; gap:9px; flex-wrap:wrap; margin-top:16px; }
.mkc-a{ font:inherit; font-size:14px; font-weight:600; cursor:pointer; border-radius:11px; padding:11px 16px; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); color:var(--gv-paper-ink); display:inline-flex; align-items:center; gap:8px; }
.mkc-a:hover{ border-color:var(--gv-ember-deep); color:var(--gv-ember-ink); }
.mkc-a.pri{ background:var(--gv-ember-grad); color:#fff; border-color:transparent; }
.mkc-a.pri:hover{ color:#fff; filter:brightness(1.04); } .mkc-a:disabled{ opacity:.55; cursor:default; }

.mkc-pcwrap{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:start; }
.mkc-side{ display:flex; flex-direction:column; gap:9px; }
.mkc-rends{ margin-top:18px; border-top:1px solid var(--gv-paper-line2); padding-top:14px; }
.mkc-rlab{ font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--gv-paper-dim); margin-bottom:10px; }
.mkc-rrow{ display:flex; gap:9px; flex-wrap:wrap; align-items:center; }
.mkc-rthumb{ width:80px; aspect-ratio:9/6; border-radius:8px; overflow:hidden; padding:0; border:none; cursor:pointer; background:#000; position:relative; box-shadow:0 4px 12px -5px rgba(0,0,0,.35); }
.mkc-rthumb.sel{ outline:2px solid var(--gv-ember-deep); outline-offset:1px; }
.mkc-rthumb-in{ position:absolute; inset:0; width:340px; transform:scale(.2353); transform-origin:top left; pointer-events:none; }
.mkc-spin{ font:inherit; font-size:13px; font-weight:600; cursor:pointer; border:1.5px dashed var(--gv-paper-line); background:none; color:var(--gv-paper-ink); border-radius:9px; padding:9px 13px; display:inline-flex; align-items:center; gap:7px; }
.mkc-spin:hover{ border-color:var(--gv-ember-deep); color:var(--gv-ember-ink); }

.mkc-socgrid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
.mkc-soccard{ display:flex; flex-direction:column; gap:9px; }
.mkc-socplat{ font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--gv-paper-dim); }
.mkc-igbtns{ display:flex; gap:7px; }
.mkc-sbtn{ font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); color:var(--gv-paper-ink); border-radius:10px; padding:8px 10px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.mkc-sbtn.p{ flex:1; background:var(--gv-ember-grad); color:#fff; border-color:transparent; }
.mkc-sbtn.done{ background:var(--gv-ok-fill); color:var(--gv-ok); border-color:var(--gv-ok-line); }

.mkc-emsubj{ font-size:14px; margin:0 0 12px; } .mkc-emsubj span{ color:var(--gv-paper-dim); margin-right:6px; }

/* shared chips/labels (used by the video + people sheets) */
.mkc-vlabel{ font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--gv-paper-dim); margin-top:4px; }
.mkc-vchips{ display:flex; flex-wrap:wrap; gap:7px; }
.mkc-vchip{ font:inherit; font-size:12.5px; cursor:pointer; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); color:var(--gv-paper-ink); border-radius:9px; padding:6px 11px; }
.mkc-vchip:hover{ border-color:var(--gv-ember-deep); color:var(--gv-ember-ink); }
.mkc-vchip.on{ border-color:var(--gv-ember-deep); background:var(--gv-paper-tint); box-shadow:0 0 0 1px var(--gv-ember-deep) inset; color:var(--gv-ember-ink); }
/* people / farm */
.mkc-terrs{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:6px 0 14px; }
.mkc-terrnew{ display:inline-flex; gap:6px; align-items:center; }
.mkc-terrnew .mkc-in{ width:190px; padding:7px 10px; }
.mkc-reach{ background:var(--gv-paper-warm); border:1px solid var(--gv-paper-warmln); border-radius:12px; padding:13px 15px; margin-bottom:12px; }
.mkc-reachbig{ font-size:15px; color:var(--gv-paper-ink); } .mkc-reachbig b{ font-size:26px; font-weight:700; color:var(--gv-ember-ink); margin-right:6px; font-variant-numeric:tabular-nums; }
.mkc-reachsub{ font-size:12.5px; color:var(--gv-paper-dim); margin-top:3px; }
.mkc-parse{ border:1px solid var(--gv-paper-line); border-radius:12px; padding:12px 14px; background:var(--gv-paper-raised); font-size:13px; display:flex; flex-direction:column; gap:8px; margin-top:4px; }
.mkc-parsesub{ font-size:12px; color:var(--gv-paper-dim); }
.mkc-costrow{ display:flex; gap:10px; flex-wrap:wrap; margin:4px 0 10px; }
.mkc-costrow label{ font-size:12px; color:var(--gv-paper-dim); display:flex; flex-direction:column; gap:4px; }
.mkc-costrow .mkc-in{ width:120px; }
.mkc-verdict{ display:flex; gap:9px; align-items:flex-start; font-size:13px; color:var(--gv-paper-ink); border:1px solid; border-radius:11px; padding:11px 13px; background:var(--gv-paper-raised); line-height:1.45; margin-bottom:14px; }
.mkc-vdot{ width:9px; height:9px; border-radius:99px; flex:0 0 auto; margin-top:5px; }
.mkc-note{ display:flex; gap:10px; font-size:13px; color:var(--gv-paper-note); background:var(--gv-paper-warm); border:1px solid var(--gv-paper-warmln); border-radius:12px; padding:12px 14px; }
.mkc-note b{ color:var(--gv-paper-ink); } .mkc-note svg{ color:var(--gv-ember-ink); flex:0 0 auto; margin-top:1px; }
.mkc-locrow2{ display:flex; align-items:center; gap:10px; margin-bottom:14px; } .mkc-locrow2 .mkc-in{ flex:1; }
.mkc-stats{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.mkc-stat{ border:1px solid var(--gv-paper-line); border-radius:12px; padding:13px 14px; background:var(--gv-paper-raised); }
.mkc-statv{ font-size:20px; font-weight:700; color:var(--gv-paper-ink); font-variant-numeric:tabular-nums; line-height:1.1; }
.mkc-statl{ font-size:11.5px; color:var(--gv-paper-dim); margin-top:4px; }
.mkc-anote{ margin-top:12px; font-size:11.5px; color:var(--gv-paper-faint); line-height:1.6; }
@media (max-width:520px){ .mkc-stats{ grid-template-columns:repeat(2,1fr); } }

@media (max-width:560px){ .mkc-form{ grid-template-columns:1fr; } .mkc-pcwrap{ grid-template-columns:1fr; } .mkc-side{ flex-direction:row; } }
`;
