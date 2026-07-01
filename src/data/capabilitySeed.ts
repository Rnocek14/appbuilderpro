// src/data/capabilitySeed.ts
// A curated baseline for the Garvis capability registry — what each known app/tool can do. Seeded on
// first run so the registry isn't empty (mirrors portfolioSeed.ts). Maturity is HONEST: most are stub/
// draft because the apps aren't fully built — Garvis can still RECOMMEND them, and they get wired as
// callable tools later. app_slug is matched to apps.slug at seed time; null = Garvis-native.

import type { CapabilityMaturity, CapabilitySafety } from '../types';

export interface SeedCapability {
  app_slug: string | null; // null = Garvis-native
  name: string;
  description: string;
  safety_level: CapabilitySafety;
  maturity: CapabilityMaturity;
  approval_required: boolean;
}

export const CAPABILITY_SEED: SeedCapability[] = [
  // Garvis-native (already a wired tool)
  { app_slug: null, name: 'generate_short_script', description: 'Draft a short-form video script (hook/script/caption/CTA/beats). Script only — no render.', safety_level: 'read_only', maturity: 'working', approval_required: false },

  // Traction Engine — AI video factory + social growth
  { app_slug: 'traction-engine', name: 'generate_video_script', description: 'Generate a full video script from a topic/brief.', safety_level: 'read_only', maturity: 'draft', approval_required: false },
  { app_slug: 'traction-engine', name: 'render_video', description: 'Render a video from a script/storyboard (Runway/Luma). Produces a real asset.', safety_level: 'external_action', maturity: 'stub', approval_required: true },
  { app_slug: 'traction-engine', name: 'content_calendar', description: 'Plan and schedule a content calendar across channels.', safety_level: 'writes_data', maturity: 'stub', approval_required: true },
  { app_slug: 'traction-engine', name: 'trend_analysis', description: 'Analyze current trends for a niche/platform.', safety_level: 'read_only', maturity: 'stub', approval_required: false },
  { app_slug: 'traction-engine', name: 'publish_social', description: 'Publish a post to connected social accounts.', safety_level: 'external_action', maturity: 'stub', approval_required: true },

  // Theory Thread — research brain
  { app_slug: 'theory-thread', name: 'compare_theories', description: 'Compare published papers/theories and surface agreements and contradictions.', safety_level: 'read_only', maturity: 'draft', approval_required: false },
  { app_slug: 'theory-thread', name: 'extract_claims', description: 'Extract structured claims + evidence from a paper or source.', safety_level: 'read_only', maturity: 'draft', approval_required: false },
  { app_slug: 'theory-thread', name: 'research_synthesis', description: 'Synthesize accumulated research into an insight with citations.', safety_level: 'read_only', maturity: 'stub', approval_required: false },

  // Idea Digester Spark — content/publish autopilot
  { app_slug: 'idea-digester-spark', name: 'draft_newsletter', description: 'Draft a newsletter issue from recent items.', safety_level: 'read_only', maturity: 'draft', approval_required: false },
  { app_slug: 'idea-digester-spark', name: 'publish_post', description: 'Publish an approved post to the live site.', safety_level: 'external_action', maturity: 'draft', approval_required: true },

  // FableForge (this app) — the build factory
  { app_slug: 'appbuilderpro', name: 'generate_app', description: 'Generate a new app from a prompt (cold-start pipeline).', safety_level: 'writes_data', maturity: 'working', approval_required: true },
  { app_slug: 'appbuilderpro', name: 'edit_app', description: 'Iteratively edit an existing project via chat (plan/edit modes).', safety_level: 'writes_data', maturity: 'working', approval_required: true },
  { app_slug: 'appbuilderpro', name: 'research_market', description: 'Deep market/competitor research for a project (web search + code analysis).', safety_level: 'read_only', maturity: 'working', approval_required: false },
];
