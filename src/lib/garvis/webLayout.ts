// src/lib/garvis/webLayout.ts
// The reusable "web" layout — the Explore galaxy, generalized so ANY collection can be explored as a
// spatial web: contacts, rated prospect sites, listings, worlds. Peers cluster into CONSTELLATIONS by
// a category (each group gets a hub on a ring), and each node's SIZE encodes a real metric (warmth,
// weakness, value…). Pure + deterministic (no randomness), so the same data always draws the same
// web and it's fully testable. The look lives in ConstellationWeb; the math lives here.

export interface WebNode {
  id: string;
  label: string;
  sub?: string;
  group: string;             // which constellation this node belongs to (a group key)
  metric?: number;           // ≥0, drives node size (bigger metric → bigger orb). Default 1.
  badge?: string | number;   // a small count/label on the orb
}

export interface WebGroupDef { key: string; label: string; color: string }

export interface PlacedNode {
  id: string; label: string; sub?: string; group: string; badge?: string | number;
  x: number; y: number;      // percent (0–100) within the canvas
  r: number;                 // orb radius in px
  color: string;             // the group's color
  primary: boolean;          // the standout of its constellation (biggest metric) — labelled by default
}
export interface PlacedHub { key: string; label: string; color: string; x: number; y: number; count: number }
export interface WebLayout { nodes: PlacedNode[]; hubs: PlacedHub[]; empty: boolean }

export interface WebLayoutOpts {
  rMin?: number; rMax?: number;   // orb radius range (px)
  hubRadius?: number;             // how far the constellation hubs sit from center (%)
  nodeGap?: number;               // phyllotaxis spacing within a constellation (%)
  pad?: number;                   // keep everything this far from the edges (%)
}

const GOLDEN = 2.399963229728653; // ~137.5° — even, non-overlapping phyllotaxis packing

/** A stable 0..1 pseudo-random from a string — for gentle organic jitter without Math.random. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Lay the nodes out as constellations. Groups with no nodes are skipped (no empty hubs). */
export function layoutWeb(nodes: WebNode[], groups: WebGroupDef[], opts: WebLayoutOpts = {}): WebLayout {
  const rMin = opts.rMin ?? 16, rMax = opts.rMax ?? 46;
  const hubRadius = opts.hubRadius ?? 26, nodeGap = opts.nodeGap ?? 3.1, pad = opts.pad ?? 8;
  if (!nodes.length) return { nodes: [], hubs: [], empty: true };

  const colorOf = new Map(groups.map((g) => [g.key, g]));
  // Only the groups that actually have nodes, in the caller's declared order.
  const present = groups.filter((g) => nodes.some((n) => n.group === g.key));
  // Any node whose group isn't declared falls into a trailing "other" constellation (honest, not dropped).
  const undated = nodes.filter((n) => !colorOf.has(n.group));
  const groupKeys: { key: string; label: string; color: string }[] = present.map((g) => ({ key: g.key, label: g.label, color: g.color }));
  if (undated.length) groupKeys.push({ key: '__other', label: 'Other', color: '#8A8076' });

  const G = groupKeys.length;
  const maxMetric = Math.max(1e-9, ...nodes.map((n) => Math.max(0, n.metric ?? 1)));

  const hubs: PlacedHub[] = [];
  const placed: PlacedNode[] = [];

  groupKeys.forEach((g, gi) => {
    const members = (g.key === '__other' ? undated : nodes.filter((n) => n.group === g.key))
      // biggest metric nearest the hub center (most important reads first)
      .slice().sort((a, b) => (b.metric ?? 1) - (a.metric ?? 1));
    // Hub position: on a ring around the center (or the center itself when there's one group).
    const a = (-90 + gi * (360 / G)) * (Math.PI / 180);
    const hx = G === 1 ? 50 : 50 + hubRadius * Math.cos(a);
    const hy = G === 1 ? 50 : 50 + hubRadius * Math.sin(a);
    hubs.push({ key: g.key, label: g.label, color: g.color, x: hx, y: hy, count: members.length });

    members.forEach((n, j) => {
      // Phyllotaxis around the hub, with a touch of deterministic jitter for an organic feel.
      const ang = j * GOLDEN + hash01(n.id) * 0.6;
      const rad = nodeGap * Math.sqrt(j) * (0.85 + hash01(n.id + 'r') * 0.3);
      const x = clamp(hx + rad * Math.cos(ang), pad, 100 - pad);
      const y = clamp(hy + rad * Math.sin(ang), pad, 100 - pad);
      const t = clamp((n.metric ?? 1) / maxMetric, 0, 1);
      const r = Math.round(rMin + t * (rMax - rMin));
      placed.push({ id: n.id, label: n.label, sub: n.sub, group: g.key, badge: n.badge, x, y, r, color: g.color, primary: j === 0 });
    });
  });

  return { nodes: placed, hubs, empty: false };
}
