// src/lib/garvis/github.ts
// Read-only GitHub awareness for Garvis. api.github.com is CORS-enabled, so — like the app's
// direct-mode AI calls — repo state is read straight from the browser with no backend. Public
// repos need no token (60 req/hr/IP); a PAT (optional) raises the limit and reaches private repos.
//
// This is deliberately READ-ONLY and stateless: it fetches a compact, current snapshot of a repo
// so the brain reasons over TRUTH (real commits/issues/activity) instead of seed-row guesses. No
// snapshot is persisted by this module, so there is nothing to drift out of sync.

import { parseGitHubUrl } from '../importer';

export interface RepoCommit {
  message: string;
  date: string | null;
  author: string | null;
}

export interface RepoIssue {
  number: number;
  title: string;
  comments: number;
  updatedAt: string | null;
}

export interface RepoState {
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null; // often the deploy URL
  language: string | null;
  stars: number;
  openIssues: number; // real issues only (PRs excluded)
  archived: boolean;
  isFork: boolean;
  pushedAt: string | null; // last push = "is this alive?"
  defaultBranch: string;
  recentCommits: RepoCommit[];
  topIssues: RepoIssue[];
}

const API = 'https://api.github.com';

/** Read the GitHub PAT a user may have set (optional). Browser-only; safe — never leaves the client. */
export function getGitHubToken(): string | null {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('garvis_gh_token') : null;
    const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GITHUB_TOKEN;
    return (ls || env) ?? null;
  } catch {
    return null;
  }
}

/** The GitHub account Garvis auto-discovers the portfolio from. Overridable via localStorage
 * ('garvis_gh_user') or VITE_GITHUB_USER; defaults to the owner's account. */
export function getGitHubUser(): string {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('garvis_gh_user') : null;
    const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GITHUB_USER;
    return (ls || env || 'Rnocek14').trim();
  } catch {
    return 'Rnocek14';
  }
}

function headers(token?: string | null): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghGet<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0') {
      throw new Error('GitHub rate limit reached. Set a personal access token (garvis_gh_token) to raise it.');
    }
    if (res.status === 404) throw new Error('Repo not found, or it is private and needs a token.');
    if (res.status === 401) throw new Error('GitHub token is invalid or expired.');
    throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface RawRepo {
  description: string | null;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  default_branch: string;
}

interface RawListRepo extends RawRepo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
}

/** A repo discovered on the account, mapped to the portfolio's app shape. */
export interface DiscoveredRepo {
  name: string;
  slug: string;
  description: string | null;
  repo_url: string;
  deploy_url: string | null;
  stage: 'building' | 'launched' | 'archived';
  tags: string[];
  pushedAt: string | null;
}

/**
 * List every repo Garvis should manage for an account, newest-push first. Owned, non-fork repos
 * only (forks are noise). Read-only and browser-direct like the rest of this module. A homepage =>
 * the project is deployed => stage 'launched'; archived repos => 'archived'; otherwise 'building'.
 */
export async function listUserRepos(username?: string, token?: string | null): Promise<DiscoveredRepo[]> {
  const user = (username || getGitHubUser()).trim();
  const tok = token ?? getGitHubToken();
  const raw = await ghGet<RawListRepo[]>(`/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner`, tok);
  return raw
    .filter((r) => !r.fork)
    .map((r) => ({
      name: r.name,
      slug: r.name.toLowerCase(),
      description: r.description,
      repo_url: r.html_url,
      deploy_url: r.homepage || null,
      stage: r.archived ? 'archived' : r.homepage ? 'launched' : 'building',
      tags: r.language ? [r.language.toLowerCase()] : [],
      pushedAt: r.pushed_at,
    }));
}
/**
 * Fetch a repo's README as raw text (the single richest signal for "what is this product").
 * Best-effort: returns null when there is no README (404) or any error — the caller degrades to
 * metadata-only. Capped to keep the profile prompt bounded. CORS-enabled like the rest of the API.
 */
export async function fetchRepoReadme(repoUrlOrSlug: string, token?: string | null, maxChars = 8000): Promise<string | null> {
  const parsed = parseGitHubUrl(repoUrlOrSlug);
  if (!parsed) return null;
  const { owner, repo } = parsed;
  const tok = token ?? getGitHubToken();
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}/readme`, {
      headers: { ...headers(tok), Accept: 'application/vnd.github.raw' },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}

/**
 * Count commits to a repo's default branch SINCE an ISO timestamp — the "did anything happen after I
 * committed to this?" signal for follow-up. Best-effort: returns null on any error (caller degrades).
 * Capped at `cap` (we only need "some / none / a lot", not an exact count on busy repos).
 */
export async function countCommitsSince(repoUrlOrSlug: string, sinceISO: string, token?: string | null, cap = 50): Promise<number | null> {
  const parsed = parseGitHubUrl(repoUrlOrSlug);
  if (!parsed) return null;
  const { owner, repo } = parsed;
  try {
    const commits = await ghGet<unknown[]>(
      `/repos/${owner}/${repo}/commits?since=${encodeURIComponent(sinceISO)}&per_page=${cap}`,
      token ?? getGitHubToken(),
    );
    return Array.isArray(commits) ? commits.length : null;
  } catch {
    return null;
  }
}

interface RawCommit {
  commit: { message: string; author: { date: string | null } | null };
  author: { login: string } | null;
}
interface RawIssue {
  number: number;
  title: string;
  comments: number;
  updated_at: string | null;
  pull_request?: unknown; // present => it's a PR, not an issue
}

/**
 * Fetch a compact, current snapshot of a repo. `repoUrlOrSlug` accepts a full GitHub URL or
 * "owner/repo" shorthand. Best-effort: commits/issues failures degrade to empty lists rather than
 * failing the whole call, so the brain still gets the core repo metadata.
 */
export async function fetchRepoState(repoUrlOrSlug: string, token?: string | null): Promise<RepoState> {
  const parsed = parseGitHubUrl(repoUrlOrSlug);
  if (!parsed) throw new Error(`Not a GitHub repo URL: ${repoUrlOrSlug}`);
  const { owner, repo } = parsed;
  const tok = token ?? getGitHubToken();

  const repoData = await ghGet<RawRepo>(`/repos/${owner}/${repo}`, tok);

  const [commits, issues] = await Promise.all([
    ghGet<RawCommit[]>(`/repos/${owner}/${repo}/commits?per_page=5&sha=${repoData.default_branch}`, tok).catch(() => []),
    ghGet<RawIssue[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=10&sort=updated`, tok).catch(() => []),
  ]);

  const realIssues = issues.filter((i) => !i.pull_request);

  return {
    owner,
    repo,
    description: repoData.description,
    homepage: repoData.homepage || null,
    language: repoData.language,
    stars: repoData.stargazers_count,
    openIssues: realIssues.length || repoData.open_issues_count,
    archived: repoData.archived,
    isFork: repoData.fork,
    pushedAt: repoData.pushed_at,
    defaultBranch: repoData.default_branch,
    recentCommits: commits.slice(0, 5).map((c) => ({
      message: c.commit.message.split('\n')[0].slice(0, 140),
      date: c.commit.author?.date ?? null,
      author: c.author?.login ?? null,
    })),
    topIssues: realIssues.slice(0, 8).map((i) => ({
      number: i.number,
      title: i.title.slice(0, 140),
      comments: i.comments,
      updatedAt: i.updated_at,
    })),
  };
}
