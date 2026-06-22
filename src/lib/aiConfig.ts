// src/lib/aiConfig.ts
// Runtime AI provider / model / key configuration.
//
// The browser can talk to several model providers in DIRECT mode (VITE_AI_DIRECT=true).
// Historically the provider/model/key were baked in at build time via VITE_AI_* env vars,
// which meant switching the "coding model" required editing .env and restarting Vite.
//
// This module makes the choice a RUNTIME setting: the user picks a provider + model and
// pastes the matching API key in the UI (Settings, or the chat model picker). The selection
// is stored in localStorage and read fresh on every model call, so changes take effect on
// the next message — no rebuild. The build-time VITE_AI_* values remain the fallback, so an
// existing .env keeps working until the user overrides it in the UI.
//
// In edge (production) mode the keys live in Supabase Edge Function secrets and this config
// is ignored for actual calls — it only drives the browser-side DIRECT path.

export type Provider = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'openrouter' | 'local';

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** Short blurb shown under the provider in Settings. */
  blurb: string;
  /** Where to get a key. */
  keysUrl: string;
  /** Placeholder shown in the key field (also hints at the key format). */
  keyPlaceholder: string;
  /** Whether an API key is required (local Ollama-style servers don't need one). */
  needsKey: boolean;
  /** Model id presets — editable; the user can type any model the provider supports. */
  models: string[];
  /** Default model for this provider. */
  defaultModel: string;
  /**
   * REST base for OpenAI-compatible providers (everything except Anthropic, which uses its
   * own Messages API). xAI (Grok) and Gemini both expose OpenAI-compatible /chat/completions
   * endpoints, so they reuse the same code path.
   */
  openAIBase?: string;
}

const LOCAL_BASE = (import.meta.env.VITE_LOCAL_AI_BASE_URL as string | undefined) ?? 'http://localhost:11434/v1';

// The provider catalog. Model ids are sensible presets; the model field in the UI is a free
// text combobox (datalist), so the user is never locked to these if a provider ships new ids.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    blurb: 'Claude models. Strongest at long-context coding; required for web Research.',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    needsKey: true,
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    blurb: 'GPT models via the OpenAI API.',
    keysUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    needsKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
    defaultModel: 'gpt-4o',
    openAIBase: 'https://api.openai.com/v1',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    blurb: "Grok models via xAI's OpenAI-compatible API.",
    keysUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
    needsKey: true,
    models: ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-latest', 'grok-2-vision-latest'],
    defaultModel: 'grok-3',
    openAIBase: 'https://api.x.ai/v1',
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    blurb: "Gemini models via Google's OpenAI-compatible endpoint.",
    keysUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    needsKey: true,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    openAIBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key, many models (Claude, GPT, Llama, …) routed through OpenRouter.',
    keysUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    needsKey: true,
    models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o', 'google/gemini-2.0-flash-001', 'x-ai/grok-3'],
    defaultModel: 'anthropic/claude-sonnet-4.5',
    openAIBase: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'local',
    label: 'Local (Ollama / LM Studio)',
    blurb: `OpenAI-compatible local server (${LOCAL_BASE}). No key needed.`,
    keysUrl: 'https://ollama.com',
    keyPlaceholder: '(none)',
    needsKey: false,
    models: ['qwen2.5-coder', 'llama3.1', 'deepseek-coder-v2'],
    defaultModel: 'qwen2.5-coder',
    openAIBase: LOCAL_BASE,
  },
];

export function providerInfo(id: Provider): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

// ---- env fallback (build-time values; the seed before the user picks anything) ----
const ENV_PROVIDER = ((import.meta.env.VITE_AI_PROVIDER as string | undefined) ?? 'anthropic') as Provider;
const ENV_MODEL = (import.meta.env.VITE_AI_MODEL as string | undefined) ?? '';
const ENV_KEY = (import.meta.env.VITE_AI_API_KEY as string | undefined) ?? '';
export const DIRECT = import.meta.env.VITE_AI_DIRECT === 'true';

// ---- persisted runtime config ----
const STORAGE_KEY = 'fableforge.ai.v1';
const CHANGE_EVENT = 'fableforge:ai-config';

interface StoredConfig {
  provider?: Provider;
  /** Selected model per provider, so switching providers keeps each one's choice. */
  models?: Partial<Record<Provider, string>>;
  /** API key per provider — switching providers doesn't lose the others' keys. */
  keys?: Partial<Record<Provider, string>>;
}

function read(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredConfig) : {};
  } catch {
    return {};
  }
}

function write(cfg: StoredConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage may be unavailable (private mode); fail silent */
  }
  // Notify same-tab subscribers (the native 'storage' event only fires cross-tab).
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* SSR / no window */ }
}

/** The currently selected provider (UI choice → env fallback). */
export function getProvider(): Provider {
  return read().provider ?? ENV_PROVIDER;
}

/** The selected model for a provider (UI choice → env value if it's the env provider → catalog default). */
export function getModel(provider: Provider = getProvider()): string {
  const stored = read().models?.[provider];
  if (stored && stored.trim()) return stored.trim();
  if (provider === ENV_PROVIDER && ENV_MODEL) return ENV_MODEL;
  return providerInfo(provider).defaultModel;
}

/** The API key for a provider (UI value → env value if it's the env provider). */
export function getKey(provider: Provider = getProvider()): string {
  const stored = read().keys?.[provider];
  if (stored && stored.trim()) return stored.trim();
  if (provider === ENV_PROVIDER && ENV_KEY) return ENV_KEY;
  return '';
}

export function setProvider(provider: Provider): void {
  write({ ...read(), provider });
}

export function setModel(provider: Provider, model: string): void {
  const cfg = read();
  write({ ...cfg, models: { ...cfg.models, [provider]: model } });
}

export function setKey(provider: Provider, key: string): void {
  const cfg = read();
  write({ ...cfg, keys: { ...cfg.keys, [provider]: key } });
}

export interface ResolvedAI {
  direct: boolean;
  provider: Provider;
  model: string;
  key: string;
  /** OpenAI-compatible REST base (undefined for Anthropic). */
  openAIBase?: string;
  /** Convenience: does the resolved provider have what it needs to make a call? */
  ready: boolean;
}

/**
 * Resolve the effective AI configuration for a call. Read fresh every time so a change made
 * in the UI applies to the very next request without a reload.
 */
export function resolveAI(): ResolvedAI {
  const provider = getProvider();
  const info = providerInfo(provider);
  const key = getKey(provider);
  return {
    direct: DIRECT,
    provider,
    model: getModel(provider),
    key,
    openAIBase: info.openAIBase,
    ready: info.needsKey ? !!key : true,
  };
}

/** Subscribe to config changes (same-tab + cross-tab). Returns an unsubscribe fn. */
export function subscribeAIConfig(cb: () => void): () => void {
  const onChange = () => cb();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
