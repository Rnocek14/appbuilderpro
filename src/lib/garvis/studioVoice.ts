// src/lib/garvis/studioVoice.ts
// TALK TO THE STUDIO — pure core (verified by studioVoice.verify.ts).
//
// The creative BOARDS (postcard, social, brand, merch, email) have answered to the concierge
// since the surface bridge landed: standing at the postcard board, "make one with a lake
// background" makes it there. The two VIDEO surfaces never registered — the exact studios the
// operator most wants to talk at ("make a video about the lakefront listing") ignored the dock
// completely, and the sentence fell through to routing, which sent them to the page they were
// already on.
//
// These parsers are each studio's spoken vocabulary. They are deliberately CONSERVATIVE: the
// surface tier runs before the briefing, small talk, stats and every door, so an over-eager
// claim here would steal sentences meant elsewhere. Every form is anchored — a bare "stop" must
// stay the halt word, "whats happening" must stay the briefing.

// ── THE VIDEO STUDIO — a storyboard of the world's real photos ────────────────────────────────

export type VideoAsk =
  | { kind: 'title'; title: string }        // "make a video about X" → rebuild the board around X
  | { kind: 'cut'; concept: 'proof_first' | 'story_first' | 'offer_first' }
  | { kind: 'aspect'; aspect: '9:16' | '1:1' | '16:9' }
  | { kind: 'play' }
  | { kind: 'pause' };

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const strip = (s: string): string => clean(s).replace(/[.!?]+$/, '');

// "make a video about X" / "a video of the lakefront listing" / "make one about X" — the topic
// is whatever follows the connective. Requires a video word OR the bare "one" (only one surface
// is ever active, so "one" at the video studio means a video).
const VIDEO_TOPIC =
  /^(?:lets\s+|let's\s+|can\s+you\s+|please\s+)?(?:make|create|build|do|draft|design|start)\s+(?:me\s+)?(?:a\s+|another\s+|the\s+|one\s+)?(?:video|slideshow|reel|one)\s+(?:about|of|on|for)\s+(.{3,80})$/i;

const CUTS: [RegExp, 'proof_first' | 'story_first' | 'offer_first'][] = [
  [/\b(story[\s-]?first|lead with the story|open with the story)\b/i, 'story_first'],
  [/\b(proof[\s-]?first|lead with the proof|lead with the work)\b/i, 'proof_first'],
  [/\b(offer[\s-]?first|lead with the offer|open with the offer)\b/i, 'offer_first'],
];

const ASPECTS: [RegExp, '9:16' | '1:1' | '16:9'][] = [
  [/\b(vertical|portrait|9.?16|for (tiktok|shorts|reels|instagram))\b/i, '9:16'],
  [/\b(square|1.?1)\b/i, '1:1'],
  [/\b(landscape|horizontal|widescreen|16.?9|for youtube)\b/i, '16:9'],
];

// Aspect and play/pause claims stay anchored to an imperative shell so a sentence that merely
// MENTIONS "square" or "play" is not stolen from its real destination.
const ASPECT_SHELL = /^(?:make (?:it|this|the video)|switch (?:it|this)? ?to|go|flip (?:it|this)? ?to)\s+/i;
const PLAY_RE = /^(?:play (?:it|the video|this)( from the top)?|run the video|watch it)$/i;
const PAUSE_RE = /^(?:pause( it| the video| this)?|stop (?:playing|the video))$/i;

/** The video studio's spoken vocabulary. Null = not ours; the sentence flows on. */
export function parseVideoAsk(sentence: string): VideoAsk | null {
  const t = strip(sentence);
  if (!t) return null;
  const topic = VIDEO_TOPIC.exec(t)?.[1];
  if (topic) return { kind: 'title', title: clean(topic) };
  for (const [re, concept] of CUTS) if (re.test(t)) return { kind: 'cut', concept };
  if (ASPECT_SHELL.test(t)) {
    const rest = t.replace(ASPECT_SHELL, '');
    for (const [re, aspect] of ASPECTS) if (re.test(rest)) return { kind: 'aspect', aspect };
  }
  if (PLAY_RE.test(t)) return { kind: 'play' };
  if (PAUSE_RE.test(t)) return { kind: 'pause' };
  return null;
}

// ── THE REEL STUDIO — ideate → script → storyboard ────────────────────────────────────────────

export type ReelAsk =
  | { kind: 'topic'; topic: string }        // "make a reel about X" → ideas about X, now
  | { kind: 'more' }                        // "more ideas" / "different angles"
  | { kind: 'pick'; index: number }         // "use the second one" (0-based)
  | { kind: 'restart' };                    // "start over"

const REEL_TOPIC =
  /^(?:lets\s+|let's\s+|can\s+you\s+|please\s+)?(?:make|create|do|draft|design|start|ideate)\s+(?:me\s+)?(?:a\s+|another\s+|some\s+|the\s+|one\s+)?(?:reels?|shorts?|videos?|one)\s+(?:about|of|on|for)\s+(.{3,80})$/i;
const MORE_RE = /^(?:more ideas|different (?:ideas|angles)|other angles|fresh angles|give me more|show me (?:more|others)|new ideas)$/i;
const RESTART_RE = /^(?:start over|start again|from scratch|reset (?:it|this|the reel))$/i;

// Explicit ordinals only — the bare number-words collide ("the second ONE" contains "one").
const ORDINALS: [RegExp, number][] = [
  [/\b(first|1st|number 1|idea 1)\b/i, 0],
  [/\b(second|2nd|number 2|idea 2)\b/i, 1],
  [/\b(third|3rd|number 3|idea 3)\b/i, 2],
  [/\b(fourth|4th|number 4|idea 4)\b/i, 3],
];
// "use/pick/take the second one" — anchored; a sentence that merely contains "second" is not a pick.
const PICK_SHELL = /^(?:use|pick|take|go with|choose|do)\s+(?:the\s+)?/i;

/** The reel studio's spoken vocabulary. Null = not ours. */
export function parseReelAsk(sentence: string): ReelAsk | null {
  const t = strip(sentence);
  if (!t) return null;
  const topic = REEL_TOPIC.exec(t)?.[1];
  if (topic) return { kind: 'topic', topic: clean(topic) };
  if (MORE_RE.test(t)) return { kind: 'more' };
  if (RESTART_RE.test(t)) return { kind: 'restart' };
  if (PICK_SHELL.test(t)) {
    const rest = t.replace(PICK_SHELL, '');
    // The remainder must be ABOUT an idea/one — "pick the second idea", "use the first one".
    if (/\b(one|idea|angle|concept)\b/i.test(rest)) {
      for (const [re, i] of ORDINALS) if (re.test(rest)) return { kind: 'pick', index: i };
    }
  }
  return null;
}
