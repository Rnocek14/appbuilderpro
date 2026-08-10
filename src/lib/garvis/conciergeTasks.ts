// src/lib/garvis/conciergeTasks.ts
// THE ONE TASK LIST — the concierge's whole vocabulary, assembled from the platform's own
// registries so it can never drift from the product: the nav config (every destination the
// sidebar and ⌘K know), the one-click web templates, the channel presets, and the automation
// capabilities. Add a page, template, preset, or capability anywhere in the app and the
// concierge learns it here with zero extra bookkeeping. Deterministic at module load; the same
// list feeds tier-1 matching, the suggestion chips, the guide lookup, and the AI tier's menu.

import { NAV_SECTIONS } from '../navConfig';
import { WEB_TEMPLATES } from './workweb';
import { CHANNEL_PRESETS } from './factChannel';
import { CAPABILITIES } from './automation/registry';
import { CONCIERGE_TASKS, deriveTasks, type ConciergeTask } from './concierge';

export const ALL_CONCIERGE_TASKS: ConciergeTask[] = deriveTasks(CONCIERGE_TASKS, {
  nav: NAV_SECTIONS.flatMap((s) => s.items.map(({ to, label }) => ({ to, label }))),
  templates: WEB_TEMPLATES.map(({ id, title }) => ({ id, title })),
  presets: CHANNEL_PRESETS.map(({ id, label, niche }) => ({ id, label, niche })),
  capabilities: CAPABILITIES.map(({ id, title, status }) => ({ id, title, status })),
});
