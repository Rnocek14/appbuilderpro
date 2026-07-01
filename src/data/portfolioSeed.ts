// src/data/portfolioSeed.ts
// The real products under github.com/Rnocek14, seeded into the Garvis portfolio on first run.
// Stages/revenue are first-guess placeholders — edit them in the dashboard once real numbers land.
// Trivial/asset/empty repos (my-first-ai-app, Door-Knockers, lifepath-app, the empty repos) are
// intentionally omitted; this is the portfolio of products Garvis actually manages.

import type { AppStage } from '../types';

export interface SeedApp {
  name: string;
  slug: string;
  description: string;
  repo_url: string;
  stage: AppStage;
  tags: string[];
}

const GH = 'https://github.com/Rnocek14';

export const PORTFOLIO_SEED: SeedApp[] = [
  {
    name: 'FableForge',
    slug: 'appbuilderpro',
    description: 'AI app builder — the internal factory. Generation pipeline, conversational editing, autonomous job-worker. (This app.)',
    repo_url: `${GH}/appbuilderpro`,
    stage: 'building',
    tags: ['builder', 'agent', 'core'],
  },
  {
    name: 'Idea Digester Spark',
    slug: 'idea-digester-spark',
    description: 'Local-news/community platform: scrape → AI-rewrite → approve → publish autopilot, newsletters, sponsor checkout, social sync.',
    repo_url: `${GH}/idea-digester-spark`,
    stage: 'launched',
    tags: ['content', 'marketing', 'analytics'],
  },
  {
    name: 'Traction Engine',
    slug: 'traction-engine',
    description: 'Multi-account social growth + AI video factory: script → storyboard → voiceover → Runway/Luma render → assemble reel; product research.',
    repo_url: `${GH}/traction-engine`,
    stage: 'building',
    tags: ['video', 'social', 'marketing', 'research'],
  },
  {
    name: 'Credit Optimizer',
    slug: 'credit-optimizer',
    description: 'AI education/career optimizer: ai-model-router, autonomous-workflow-engine, market forecasting. Capacitor mobile build.',
    repo_url: `${GH}/credit-optimizer`,
    stage: 'building',
    tags: ['agent', 'research', 'mobile'],
  },
  {
    name: 'Docu Guidance Guru',
    slug: 'docu-guidance-guru',
    description: 'Prop-firm/trading-risk SaaS: trade ingestion, risk throttling, competitor-intel scraping, full Stripe payout stack. Most production-mature.',
    repo_url: `${GH}/docu-guidance-guru`,
    stage: 'launched',
    tags: ['analytics', 'payments', 'research'],
  },
  {
    name: 'Mind Weave Recover',
    slug: 'mind-weave-recover',
    description: 'Speech-therapy/recovery platform: pronunciation analysis, conversation coaching, embeddings/RAG, TTS, predictive analytics.',
    repo_url: `${GH}/mind-weave-recover`,
    stage: 'building',
    tags: ['ai', 'health', 'rag'],
  },
  {
    name: 'Launch Buddy Bot (Deleteist)',
    slug: 'launch-buddy-bot',
    description: 'Privacy/data-deletion SaaS: Gmail/Outlook OAuth, breach checks, GDPR/CCPA requests, full Stripe + Resend.',
    repo_url: `${GH}/launch-buddy-bot`,
    stage: 'building',
    tags: ['saas', 'payments', 'oauth'],
  },
  {
    name: 'Theory Thread',
    slug: 'theory-thread',
    description: 'Modern TanStack-Start full-stack app (purpose still being defined). Auth + server API routes, no Supabase functions.',
    repo_url: `${GH}/theory-thread`,
    stage: 'idea',
    tags: ['fullstack'],
  },
  {
    name: 'Groovy Sound Canvas',
    slug: 'groovy-sound-canvas',
    description: 'Three.js audio-reactive visualizer. Front-end only, deployed to Cloudflare. A media/creative surface.',
    repo_url: `${GH}/groovy-sound-canvas`,
    stage: 'idea',
    tags: ['media', 'frontend'],
  },
];
