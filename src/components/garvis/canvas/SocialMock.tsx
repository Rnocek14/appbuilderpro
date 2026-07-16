// src/components/garvis/canvas/SocialMock.tsx
// A post rendered as the real thing — Instagram / Facebook / LinkedIn / X, each with that network's
// actual chrome, so what you're about to post looks like what people will see, not a wireframe.
//
// Honest by construction: it renders the REAL generated caption + the REAL attached photo. When there
// is no photo it shows a clearly-designed BRAND card (the headline over a brand gradient) — never a
// fabricated photograph. It never shows a like/comment count, because we don't have one; the action
// row is the platform's icons only. The avatar is the brand's initial on the brand color, or a real
// uploaded logo — never a stranger's face.

import { Heart, MessageCircle, Send, Bookmark, Repeat2, MoreHorizontal, Globe, ThumbsUp, Share2, Bird } from 'lucide-react';
import type { SocialPlatform } from '../../../lib/garvis/campaignCore';
import { TAG_CAP } from '../../../lib/garvis/socialBoard';

export interface MockInput {
  platform: SocialPlatform;
  brandName: string;
  caption: string;
  hashtags: string[];
  accent: string;
  imageUrl?: string | null;
  headline?: string | null;   // used for the no-photo brand card
  avatarUrl?: string | null;
}

const META: Record<SocialPlatform, { name: string; sub: string; blue: string }> = {
  instagram: { name: 'Instagram', sub: '', blue: '#0095F6' },
  facebook: { name: 'Facebook', sub: '', blue: '#1877F2' },
  linkedin: { name: 'LinkedIn', sub: '', blue: '#0A66C2' },
  x: { name: 'X', sub: '', blue: '#1D9BF0' },
};

const handleOf = (name: string) => '@' + (name || 'you').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
const initialOf = (name: string) => (name.trim()[0] || '★').toUpperCase();

/** The image zone: a real photo if we have one, otherwise a designed brand card (headline over a
 *  brand gradient) — clearly a graphic, so nothing is passed off as a photo we don't have. */
function Frame({ imageUrl, headline, accent, radius = 0, ratio = '1 / 1' }: { imageUrl?: string | null; headline?: string | null; accent: string; radius?: number; ratio?: string }) {
  if (imageUrl) {
    return <div style={{ aspectRatio: ratio, borderRadius: radius, overflow: 'hidden', background: '#000' }}><img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>;
  }
  return (
    <div style={{ aspectRatio: ratio, borderRadius: radius, overflow: 'hidden', display: 'grid', placeItems: 'center', padding: '10%', textAlign: 'center', background: `linear-gradient(140deg, ${accent}, color-mix(in srgb, ${accent} 52%, #0b0710))` }}>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1.15, textWrap: 'balance' as const, textShadow: '0 1px 10px rgba(0,0,0,.28)' }}>{headline || 'Your brand'}</div>
    </div>
  );
}

function Avatar({ name, accent, url, size = 34 }: { name: string; accent: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flex: '0 0 auto' }} />;
  return (
    <span style={{ width: size, height: size, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.42, background: `linear-gradient(140deg, ${accent}, color-mix(in srgb, ${accent} 55%, #000))` }}>{initialOf(name)}</span>
  );
}

/** Hashtags rendered in the platform's link blue (IG/LinkedIn/X); Facebook shows them inline gray. */
function Tags({ tags, color }: { tags: string[]; color: string }) {
  if (!tags.length) return null;
  return <div style={{ marginTop: 6, color, fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>{tags.join(' ')}</div>;
}

const IconRow = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#536471' }}>{children}</div>
);

export function SocialMock({ platform, brandName, caption, hashtags: allTags, accent, imageUrl, headline, avatarUrl }: MockInput) {
  const m = META[platform];
  // The preview's contract is "what you're about to post looks like what people will see" —
  // composeSocialText caps tags per platform at post time, so the mock must show the same cap.
  const hashtags = allTags.slice(0, TAG_CAP[platform]);
  const name = brandName.trim() || 'Your brand';
  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #E7E0D6', overflow: 'hidden', color: '#0F1419', fontSize: 14, boxShadow: '0 6px 20px -12px rgba(0,0,0,.3)' };

  if (platform === 'instagram') {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px' }}>
          <Avatar name={name} accent={accent} url={avatarUrl} size={30} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{name.replace(/\s+/g, '').toLowerCase()}</span>
          <span style={{ color: m.blue, fontWeight: 600, fontSize: 13 }}>· Follow</span>
          <MoreHorizontal size={16} style={{ marginLeft: 'auto', color: '#262626' }} />
        </div>
        <Frame imageUrl={imageUrl} headline={headline} accent={accent} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 11px 4px' }}>
          <Heart size={22} /><MessageCircle size={22} /><Send size={22} />
          <Bookmark size={22} style={{ marginLeft: 'auto' }} />
        </div>
        <div style={{ padding: '2px 11px 12px', lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, marginRight: 6 }}>{name.replace(/\s+/g, '').toLowerCase()}</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{caption}</span>
          <Tags tags={hashtags} color={m.blue} />
        </div>
      </div>
    );
  }

  if (platform === 'facebook') {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px 8px' }}>
          <Avatar name={name} accent={accent} url={avatarUrl} size={40} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#65676B', fontSize: 12 }}>Just now · <Globe size={11} /></div>
          </div>
        </div>
        <div style={{ padding: '0 12px 10px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{caption}<Tags tags={hashtags} color="#385898" /></div>
        <Frame imageUrl={imageUrl} headline={headline} accent={accent} ratio="1.91 / 1" />
        <div style={{ display: 'flex', borderTop: '1px solid #E7E0D6', color: '#65676B', fontSize: 13, fontWeight: 600 }}>
          {[['Like', ThumbsUp], ['Comment', MessageCircle], ['Share', Share2]].map(([label, Ic]) => {
            const I = Ic as typeof ThumbsUp;
            return <div key={label as string} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0' }}><I size={17} /> {label as string}</div>;
          })}
        </div>
      </div>
    );
  }

  if (platform === 'linkedin') {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px 8px' }}>
          <Avatar name={name} accent={accent} url={avatarUrl} size={44} />
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
            <div style={{ color: '#00000099', fontSize: 12 }}>{headline ? 'Local business' : 'Your business'} · You</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#00000099', fontSize: 12 }}>Now · <Globe size={11} /></div>
          </div>
        </div>
        <div style={{ padding: '0 12px 10px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{caption}<Tags tags={hashtags} color={m.blue} /></div>
        <Frame imageUrl={imageUrl} headline={headline} accent={accent} ratio="1.91 / 1" />
        <div style={{ display: 'flex', borderTop: '1px solid #E7E0D6', color: '#00000099', fontSize: 13, fontWeight: 600 }}>
          {[['Like', ThumbsUp], ['Comment', MessageCircle], ['Repost', Repeat2], ['Send', Send]].map(([label, Ic]) => {
            const I = Ic as typeof ThumbsUp;
            return <div key={label as string} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0' }}><I size={16} /> {label as string}</div>;
          })}
        </div>
      </div>
    );
  }

  // X
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 12px 8px' }}>
        <Avatar name={name} accent={accent} url={avatarUrl} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>{name}</span>
            <span style={{ color: '#536471' }}>{handleOf(name)} · now</span>
            <MoreHorizontal size={16} style={{ marginLeft: 'auto', color: '#536471' }} />
          </div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, margin: '3px 0 8px' }}>{caption}{hashtags.length ? <span style={{ color: m.blue }}> {hashtags.join(' ')}</span> : null}</div>
          {(imageUrl || headline) && <div style={{ marginBottom: 8 }}><Frame imageUrl={imageUrl} headline={headline} accent={accent} radius={16} ratio="16 / 9" /></div>}
          <IconRow>
            <MessageCircle size={17} /><Repeat2 size={18} /><Heart size={17} /><Bird size={17} style={{ marginLeft: 'auto', opacity: .6 }} />
          </IconRow>
        </div>
      </div>
    </div>
  );
}

/** The exact text that would post/copy for this platform (caption + tags, joined the way that
 *  network expects). X keeps tags inline; the rest append a tag block. */
export function composePostText(platform: SocialPlatform, caption: string, hashtags: string[]): string {
  if (!hashtags.length) return caption;
  if (platform === 'x') return `${caption} ${hashtags.join(' ')}`.trim();
  return `${caption}\n\n${hashtags.join(' ')}`;
}

/** Provider platform id (Ayrshare uses "twitter" for X). */
export function providerPlatform(p: SocialPlatform): string { return p === 'x' ? 'twitter' : p; }
