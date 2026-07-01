export type Plan = 'free' | 'pro';
export type Role = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  plan: Plan;
  monthly_generation_limit: number;
  webhook_url: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  template_slug: string | null;
  status: 'draft' | 'generating' | 'ready' | 'error';
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  path: string;
  content: string;
  version: number;
  updated_by_ai: boolean;
  updated_at: string;
}

export interface FileVersion {
  id: string;
  file_id: string;
  path: string;
  content: string;
  version: number;
  created_at: string;
}

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface StageEntry {
  stage: string;
  status: 'running' | 'done';
  started_at: string;
  finished_at?: string;
  note?: string;
}

export interface Generation {
  id: string;
  project_id: string;
  prompt: string;
  kind: 'create' | 'edit' | 'fix';
  status: GenerationStatus;
  current_stage: string | null;
  stages: StageEntry[];
  summary: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
}

export interface AIMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  files_changed: string[];
  created_at: string;
  /** Conversation thread this message belongs to. NULL/undefined = the default "Main" thread. */
  thread_id?: string | null;
}

// A proposed implementation plan the assistant presents before writing code
// (plan mode). The user approves it, refines it in chat, or discusses — no
// files change until approval. Named EditPlan to avoid clashing with the
// billing `Plan` type above.
export interface EditPlan {
  summary: string;
  steps: string[];
  fileHints: string[];
  options: string[];
  openQuestions: string[];
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: Plan;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  interval: 'month' | 'year' | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  event_type: string;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface Deployment {
  id: string;
  project_id: string;
  target: 'vercel' | 'netlify' | 'supabase';
  status: 'pending' | 'building' | 'live' | 'failed';
  url: string | null;
  created_at: string;
}

export interface Template {
  slug: string;
  name: string;
  tagline: string;
  prompt: string;
  icon: string;
}

// ---------------- autopilot ----------------
export type JobStatus = 'queued' | 'running' | 'waiting_approval' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  brief: string;
  status: JobStatus;
  priority: number;
  phase: string;
  milestone_index: number;
  fix_attempts: number;
  budget_usd: number;
  spent_usd: number;
  max_fix_attempts: number;
  pause_reason: string | null;
  report: { summary?: string; built?: string[]; concerns?: string[]; skipped?: string[] } | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface JobMilestone {
  id: string;
  job_id: string;
  position: number;
  title: string;
  description: string;
  status: 'pending' | 'building' | 'done' | 'done_with_warnings' | 'skipped';
  summary: string | null;
  warning: string | null;
}

export interface AgentQuestion {
  id: string;
  job_id: string;
  project_id: string;
  question: string;
  context: string | null;
  options: string[];
  blocking: boolean;
  answer: string | null;
  status: 'pending' | 'answered' | 'skipped';
  created_at: string;
}

// ---------------- garvis portfolio (control plane above the builder) ----------------
export type AppStage = 'idea' | 'building' | 'launched' | 'growing' | 'paused' | 'archived';

/** The founder's JUDGMENT of how much an app matters — the strategic lens, distinct from lifecycle/stage. */
export type StrategicImportance = 'core' | 'supporting' | 'experimental';

/** A REAL owned product Garvis manages — distinct from a generated `Project`. */
export interface PortfolioApp {
  id: string;
  owner_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  repo_url: string | null;
  deploy_url: string | null;
  stage: AppStage;
  project_id: string | null; // optional link to the FableForge project that builds it
  goals: string | null;
  strategic_importance: StrategicImportance | null; // null = unclassified; owner-set judgment
  strategic_role: string | null; // why it matters / platform role / relationship to other apps
  monthly_revenue: number;
  tags: string[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppMetric {
  id: string;
  app_id: string;
  owner_id: string;
  metric_date: string;
  source: 'manual' | 'ga' | 'stripe' | 'plausible' | 'custom';
  visitors: number;
  signups: number;
  active_users: number;
  revenue: number;
  created_at: string;
}

export type AgentRunStatus =
  | 'queued' | 'running' | 'waiting_approval' | 'paused' | 'succeeded' | 'failed' | 'cancelled';

export interface AgentRun {
  id: string;
  owner_id: string;
  app_id: string | null; // null = portfolio-wide
  kind: 'research' | 'content' | 'build' | 'analyze' | 'recommend';
  title: string;
  status: AgentRunStatus;
  input: string | null;
  output: string | null;
  recommendation: string | null;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
  // ---- runtime (app_0004) ----
  phase: 'observe' | 'plan' | 'act';
  priority: number;
  budget_usd: number;
  spent_usd: number;
  lease_until: string | null;
  checkpoint: GarvisCheckpoint | null;
  error: string | null;
  started_at: string | null;
}

/** Resumable execution state persisted on agent_runs after every step. */
export interface GarvisCheckpoint {
  step: number;
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[];
}

// ---- Garvis knowledge layer (app_0005) — the durable "Learn" store ----
export type KnowledgeKind = 'decision' | 'outcome' | 'lesson';
export type KnowledgeStatus = 'proposed' | 'approved' | 'rejected';

// ---- Garvis objective layer (app_0006) — goals/constraints + capability registry ----
export type GoalStatus = 'proposed' | 'active' | 'achieved' | 'paused' | 'abandoned';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type CapabilitySafety = 'read_only' | 'writes_data' | 'external_action';
export type CapabilityMaturity = 'stub' | 'draft' | 'working' | 'production';
export type CapabilityStatus = 'proposed' | 'approved' | 'retired';

/** An objective Garvis optimizes for. Only 'active' goals inject into reasoning context. */
export interface GarvisGoal {
  id: string;
  owner_id: string;
  app_id: string | null; // null = portfolio-wide
  title: string;
  description: string | null;
  priority: number; // 1 = highest
  success_metric: string | null;
  target_date: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

/** Global limits — one row per owner. The brain reasons over these; it never stores derived allocations. */
export interface GarvisConstraints {
  owner_id: string;
  weekly_hours: number | null;
  monthly_budget_usd: number | null;
  risk_tolerance: RiskLevel;
  max_active_projects: number | null;
  notes: string | null;
  updated_at: string;
}

/** A catalog entry for what an app/tool can do. Only 'approved' capabilities inject into context. */
export interface GarvisCapability {
  id: string;
  owner_id: string;
  app_id: string | null; // null = Garvis-native
  name: string;
  description: string;
  input_spec: string | null;
  output_spec: string | null;
  safety_level: CapabilitySafety;
  approval_required: boolean;
  maturity: CapabilityMaturity;
  status: CapabilityStatus;
  created_at: string;
  updated_at: string;
}

// ---- Garvis Opportunity Detection (app_0012) — the proactive, cross-app layer ----
export type OpportunityType = 'synergy' | 'expansion' | 'consolidation' | 'risk' | 'quick_win' | 'positioning';
export type OpportunityStatus = 'new' | 'saved' | 'dismissed' | 'converted';

/** A proactively-noticed opportunity across the portfolio (Garvis found it; you didn't ask). */
export interface GarvisOpportunity {
  id: string;
  owner_id: string;
  title: string;
  type: OpportunityType;
  rationale: string | null;
  suggested_move: string | null;
  related_apps: string[];
  confidence: number | null;
  status: OpportunityStatus;
  mission_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

// ---- Garvis Mission orchestrator (app_0011) — the Jarvis front door + worker dispatch ----
export type WorkerKind = 'research' | 'analytics' | 'marketing' | 'bug' | 'builder';
export type MissionStatus = 'planning' | 'planned' | 'running' | 'review' | 'done' | 'failed';
export type TaskStatus = 'queued' | 'running' | 'blocked' | 'done' | 'failed' | 'skipped';

/** A produced work-product (a report, a diagnosis, a plan). Marketing additionally writes its own tables. */
export interface TaskArtifact { kind: string; title: string; body: string }
export interface TaskResultData { summary: string; artifacts: TaskArtifact[]; link?: string | null }

/** A high-level objective the founder hands Garvis. */
export interface GarvisMission {
  id: string;
  owner_id: string;
  app_id: string | null;
  objective: string;
  subject: string | null;
  status: MissionStatus;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

/** One decomposed, worker-typed step of a mission. */
export interface GarvisTask {
  id: string;
  owner_id: string;
  mission_id: string;
  seq: number;
  worker: WorkerKind;
  title: string;
  input: Record<string, unknown>;
  status: TaskStatus;
  result: TaskResultData | null;
  verify: { ok: boolean; issues: string[]; warnings: string[] } | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
}

// ---- Garvis DO-layer (app_0010) — the Marketing Worker's campaigns + deliverables ----
export type MarketingAssetKind = 'strategy' | 'calendar' | 'social_post' | 'email' | 'landing_page';
export type MarketingAssetStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'rejected';
export type MarketingCampaignStatus = 'generating' | 'review' | 'active' | 'done' | 'failed';

/** A marketing mission: a brief + subject (a portfolio app, or an external thing being marketed). */
export interface MarketingCampaign {
  id: string;
  owner_id: string;
  app_id: string | null;
  subject: string;
  brief: string | null;
  status: MarketingCampaignStatus;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

/** A produced deliverable with its own draft→approved→scheduled→published lifecycle (the publish queue). */
export interface MarketingAsset {
  id: string;
  owner_id: string;
  campaign_id: string;
  kind: MarketingAssetKind;
  title: string | null;
  content: Record<string, unknown>;
  channel: string | null;
  status: MarketingAssetStatus;
  scheduled_for: string | null;
  published_at: string | null;
  verify: { ok: boolean; issues: string[]; warnings: string[] } | null;
  created_at: string;
  updated_at: string;
}

// ---- Garvis senses layer (app_0008) — automatic outcome signal: is the deploy reachable? ----
/** One liveness check of an app's deploy URL. Append-only; `reachable` is CORS-blind (host responded). */
export interface AppLiveness {
  id: string;
  owner_id: string;
  app_id: string;
  checked_at: string;
  reachable: boolean;
  status: string | null;
  latency_ms: number | null;
  source: string;
}

// ---- Garvis app-intelligence layer (app_0007) — a generated profile per app ----
/**
 * A GENERATED (not approval-gated) profile of what a portfolio app IS and where it stands.
 * Derived from the repo (README + commits + issues + metadata), regenerable, one row per app.
 * This is the product-level context the brain lacked when reasoning off commit messages alone.
 */
export interface GarvisAppProfile {
  id: string;
  owner_id: string;
  app_id: string;
  purpose: string | null;
  audience: string | null;
  business_model: string | null;
  current_state: string | null;
  blocker: string | null;
  next_milestone: string | null;
  stage_assessment: string | null;
  confidence: number | null; // 0..1
  source: string | null;
  model: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

/** A sourced assertion: claim (title/body) + provenance (source/run_id) + confidence. */
export interface GarvisKnowledge {
  id: string;
  owner_id: string;
  app_id: string | null; // null = portfolio-wide
  run_id: string | null; // which agent_run proposed it
  kind: KnowledgeKind;
  title: string;
  body: string;
  source: string | null;
  confidence: number | null; // 0..1
  status: KnowledgeStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}
