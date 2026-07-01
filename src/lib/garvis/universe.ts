// src/lib/garvis/universe.ts
// Persistence for the Knowledge Universe — so it's STILL THERE when you come back, and can grow
// across sessions (the substrate the epiphany engine, patterns, and "welcome back" all stand on).
//
// Local-first: writes to localStorage immediately (reliable, zero setup, survives every session),
// so the experience is real today. The Supabase migration (app_0013_knowledge_universe.sql) is the
// cloud/multi-device/heartbeat upgrade — once it's pushed, swap load/save to the supabase paths
// stubbed below. The shape here matches that schema 1:1 so the swap is mechanical.

import type { ClusterGraph } from './clustering';

export interface Universe {
  id: string;
  title: string;
  graph: ClusterGraph;
  focusId: string | null;
  createdAt: string;
  updatedAt: string;
}

const KEY = 'ff:universe:v1';

function now(): string {
  // Date is fine in app code (the no-Date rule is only for workflow scripts).
  return new Date().toISOString();
}

export function newUniverse(title: string, graph: ClusterGraph, focusId: string | null): Universe {
  const ts = now();
  return { id: `u_${Math.random().toString(36).slice(2, 10)}`, title, graph, focusId, createdAt: ts, updatedAt: ts };
}

export function loadUniverse(): Universe | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Universe;
    if (!u?.graph?.clusters) return null;
    return u;
  } catch {
    return null;
  }
}

export function saveUniverse(u: Universe): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...u, updatedAt: now() }));
  } catch {
    /* storage full / unavailable — fail silent */
  }
}

export function clearUniverse(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Human "last seen" string for the welcome-back line. */
export function lastSeen(u: Universe): string {
  try {
    const ms = Date.now() - new Date(u.updatedAt).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  } catch {
    return 'earlier';
  }
}
