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
