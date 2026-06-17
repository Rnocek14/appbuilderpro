// src/pages/ImportProject.tsx
// Import an existing project (e.g. a Lovable project) from GitHub or a zip export.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, FileArchive, FolderDown, Lock, CheckCircle2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card, Input, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { analyzeZip, fetchGitHubZip, parseGitHubUrl, persistImport, type ImportAnalysis } from '../lib/importer';
import { cn } from '../lib/utils';

type Source = 'github' | 'zip';

export default function ImportProject() {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [source, setSource] = useState<Source>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'analyzing' | 'importing' | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');

  const analyzeGitHub = async () => {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) { toast('error', 'Enter a GitHub URL like https://github.com/you/my-app'); return; }
    setBusy('analyzing');
    try {
      const data = await fetchGitHubZip(parsed.owner, parsed.repo, parsed.ref, token || undefined);
      const result = await analyzeZip(data, parsed.repo);
      setAnalysis(result);
      setName(result.name);
      setSourceLabel(`github.com/${parsed.owner}/${parsed.repo}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not fetch the repo');
    } finally {
      setBusy(null);
    }
  };

  const analyzeFile = async (file: File) => {
    setBusy('analyzing');
    try {
      const result = await analyzeZip(file, file.name.replace(/\.zip$/i, ''));
      setAnalysis(result);
      setName(result.name);
      setSourceLabel(file.name);
    } catch {
      toast('error', 'Could not read that zip file');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!analysis || !session) return;
    setBusy('importing');
    try {
      const id = await persistImport(
        session.user.id,
        name.trim() || analysis.name,
        `Imported from ${sourceLabel}`,
        analysis.files,
        sourceLabel,
      );
      toast('success', `Imported ${analysis.files.length} files`);
      navigate(`/project/${id}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Import failed');
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-2xl font-semibold text-forge-ink">Import a project</h1>
        <p className="mt-1 text-sm text-forge-dim">
          Bring an existing app into FableForge — Lovable projects sync to GitHub, so a repo URL is the
          quickest route. A zip export of the code works too.
        </p>

        <div className="mt-6 flex gap-2">
          {([
            { key: 'github', label: 'From GitHub', icon: Github },
            { key: 'zip', label: 'From a zip', icon: FileArchive },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setSource(key); setAnalysis(null); }}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors',
                source === key
                  ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ink'
                  : 'border-forge-border text-forge-dim hover:border-forge-ember/30',
              )}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {source === 'github' && (
          <Card className="mt-4 space-y-3 p-5">
            <label className="block text-xs text-forge-dim">
              Repository URL
              <Input
                className="mt-1"
                placeholder="https://github.com/you/my-lovable-app"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </label>
            <label className="block text-xs text-forge-dim">
              Access token (only for private repos)
              <Input
                className="mt-1"
                type="password"
                placeholder="ghp_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <p className="flex items-start gap-1.5 text-xs text-forge-dim">
              <Lock size={12} className="mt-0.5 shrink-0" />
              The token is used once in your browser to download the repo and is never stored.
              Create one at GitHub → Settings → Developer settings → Fine-grained tokens (read-only contents).
            </p>
            <Button onClick={analyzeGitHub} loading={busy === 'analyzing'} disabled={busy !== null || !repoUrl.trim()}>
              <FolderDown size={15} /> Fetch repo
            </Button>
          </Card>
        )}

        {source === 'zip' && (
          <Card className="mt-4 p-5">
            <label
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-forge-border px-6 py-10 text-center text-sm text-forge-dim hover:border-forge-ember/40"
            >
              <FileArchive size={22} className="text-forge-ember" />
              {busy === 'analyzing' ? 'Reading zip…' : 'Click to choose a .zip of your project'}
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && analyzeFile(e.target.files[0])}
              />
            </label>
            <p className="mt-2 text-xs text-forge-dim">
              In Lovable: connect GitHub and download the repo zip, or use your local clone zipped up.
              node_modules and build folders are filtered out automatically.
            </p>
          </Card>
        )}

        {analysis && (
          <Card className="mt-4 space-y-4 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-forge-ok" />
              <p className="text-sm text-forge-ink">
                Found <span className="font-medium">{analysis.files.length} files</span> in {sourceLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.isVite && <Badge tone="ok">Vite app — live preview supported</Badge>}
              {analysis.hasSupabase && <Badge tone="ember">Uses Supabase</Badge>}
              {analysis.skipped.length > 0 && (
                <Badge>{analysis.skipped.length} files skipped (deps, builds, binaries)</Badge>
              )}
            </div>
            <div className="max-h-44 overflow-auto panel-scroll rounded-lg border border-forge-border bg-forge-bg p-3 font-mono text-[11px] leading-5 text-forge-dim">
              {analysis.files.slice(0, 40).map((f) => <div key={f.path}>{f.path}</div>)}
              {analysis.files.length > 40 && <div>… and {analysis.files.length - 40} more</div>}
            </div>
            <label className="block text-xs text-forge-dim">
              Project name
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <Button onClick={runImport} loading={busy === 'importing'} disabled={busy !== null}>
              <FolderDown size={15} />
              {busy === 'importing' ? 'Importing…' : `Import ${analysis.files.length} files`}
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
