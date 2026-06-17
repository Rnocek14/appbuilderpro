import { useEffect, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { X, Save, History, Dot } from 'lucide-react';
import type { ProjectFile, FileVersion } from '../../types';
import { cn, languageFor, timeAgo } from '../../lib/utils';
import { Button, Spinner } from '../ui';

interface Props {
  files: ProjectFile[];
  openPaths: string[];
  activePath: string | null;
  drafts: Record<string, string>;
  onDraftChange: (path: string, content: string) => void;
  onActivate: (path: string) => void;
  onCloseTab: (path: string) => void;
  onSave: (path: string, content: string) => Promise<void>;
  getVersions: (fileId: string) => Promise<FileVersion[]>;
}

export function CodeEditorPane({ files, openPaths, activePath, drafts, onDraftChange, onActivate, onCloseTab, onSave, getVersions }: Props) {
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [compareVersion, setCompareVersion] = useState<FileVersion | null>(null);

  const activeFile = files.find((f) => f.path === activePath) ?? null;
  const draft = activePath ? drafts[activePath] : undefined;
  const value = draft ?? activeFile?.content ?? '';
  const dirty = draft !== undefined && draft !== activeFile?.content;

  // when the AI rewrites the active file and there is no local draft, show the new content
  useEffect(() => {
    setCompareVersion(null);
    setShowHistory(false);
  }, [activePath]);

  const save = async () => {
    if (!activePath || !dirty) return;
    setSaving(true);
    await onSave(activePath, drafts[activePath]);
    setSaving(false);
  };

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openHistory = async () => {
    if (!activeFile) return;
    setShowHistory(true);
    setVersions(await getVersions(activeFile.id));
  };

  if (!activePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-forge-dim">
        Open a file from the tree, or ask the assistant to build something.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* tabs */}
      <div className="flex items-center border-b border-forge-border bg-forge-panel">
        <div className="flex flex-1 overflow-x-auto panel-scroll" role="tablist" aria-label="Open files">
          {openPaths.map((p) => {
            const isDirty = drafts[p] !== undefined && drafts[p] !== files.find((f) => f.path === p)?.content;
            return (
              <div
                key={p}
                role="tab"
                aria-selected={p === activePath}
                className={cn(
                  'group flex shrink-0 cursor-pointer items-center gap-1 border-r border-forge-border px-3 py-2 font-mono text-xs',
                  p === activePath ? 'bg-forge-bg text-forge-ink ember-seam' : 'text-forge-dim hover:text-forge-ink',
                )}
                onClick={() => onActivate(p)}
              >
                {isDirty && <Dot size={16} className="-ml-1.5 text-forge-ember" aria-label="Unsaved changes" />}
                {p.split('/').pop()}
                <button
                  aria-label={`Close ${p}`}
                  className="ml-1 rounded p-0.5 opacity-0 hover:bg-forge-raised group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onCloseTab(p); }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1 px-2">
          <Button size="sm" variant="ghost" onClick={openHistory} aria-label="File history">
            <History size={13} /> History
          </Button>
          <Button size="sm" variant={dirty ? 'primary' : 'ghost'} onClick={save} loading={saving} disabled={!dirty}>
            <Save size={13} /> Save
          </Button>
        </div>
      </div>

      {/* editor or diff */}
      <div className="min-h-0 flex-1">
        {showHistory && compareVersion ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-forge-border px-3 py-1.5 text-xs text-forge-dim">
              <span>v{compareVersion.version} ({timeAgo(compareVersion.created_at)}) → current</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={async () => { await onSave(activePath, compareVersion.content); setCompareVersion(null); setShowHistory(false); }}>
                  Restore this version
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCompareVersion(null)}>Close diff</Button>
              </div>
            </div>
            <DiffEditor
              original={compareVersion.content}
              modified={value}
              language={languageFor(activePath)}
              theme="vs-dark"
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        ) : (
          <Editor
            path={activePath}
            value={value}
            language={languageFor(activePath)}
            theme="vs-dark"
            loading={<Spinner label="Starting editor…" />}
            onChange={(v) => onDraftChange(activePath, v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12 },
            }}
          />
        )}
      </div>

      {/* history drawer */}
      {showHistory && !compareVersion && (
        <div className="border-t border-forge-border bg-forge-panel">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-forge-dim">Version history</span>
            <button className="text-xs text-forge-dim hover:text-forge-ink" onClick={() => setShowHistory(false)}>Close</button>
          </div>
          <ul className="max-h-36 overflow-y-auto panel-scroll pb-2">
            {versions.length === 0 && <li className="px-3 py-2 text-xs text-forge-dim">No earlier versions — edits will appear here once the file changes.</li>}
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-forge-dim hover:bg-forge-raised hover:text-forge-ink"
                  onClick={() => setCompareVersion(v)}
                >
                  <span className="font-mono">v{v.version}</span>
                  <span>{timeAgo(v.created_at)}</span>
                  <span className="text-forge-ember">View diff</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
