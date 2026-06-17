import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FolderOpen, Copy, Archive, Trash2, MoreVertical, Hammer, FolderDown } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useProjects } from '../hooks/useProjectData';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Input, Spinner } from '../components/ui';
import { timeAgo } from '../lib/utils';

export default function Dashboard() {
  const { projects, loading, archiveProject, deleteProject, duplicateProject } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? p.archived : !p.archived))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
  }, [projects, query, showArchived]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl" onClick={() => setMenuFor(null)}>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold">Projects</h1>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-forge-dim hover:text-forge-ink"
            aria-pressed={showArchived}
          >
            {showArchived ? '← Back to active' : `Archived (${projects.filter((p) => p.archived).length})`}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-forge-dim" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…" className="w-56 pl-8" aria-label="Search projects" />
            </div>
            <Link to="/import">
              <Button variant="ghost"><FolderDown size={15} /> Import</Button>
            </Link>
            <Link to="/new">
              <Button><Plus size={15} /> New project</Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center"><Spinner label="Loading projects…" /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Hammer size={28} />}
            title={query ? 'No matches' : showArchived ? 'No archived projects' : 'The forge is cold'}
            body={query ? `Nothing matches “${query}”. Try a different name.` : showArchived ? 'Projects you archive will wait here.' : 'Describe your first app and watch it take shape — blueprint, files, live preview.'}
            action={!query && !showArchived ? <Link to="/new"><Button><Plus size={15} /> Forge your first app</Button></Link> : undefined}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <Card key={p.id} className="group relative p-4 transition-colors hover:border-forge-ember/40">
                <button onClick={() => navigate(`/project/${p.id}`)} className="block w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <FolderOpen size={16} className="mt-0.5 shrink-0 text-forge-ember" />
                    <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold">{p.name}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-xs text-forge-dim">{p.description ?? 'No description yet — generation will write one.'}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge tone={p.status === 'ready' ? 'ok' : p.status === 'generating' ? 'ember' : p.status === 'error' ? 'err' : 'dim'}>{p.status}</Badge>
                    <span className="ml-auto text-[11px] text-forge-dim">{timeAgo(p.updated_at)}</span>
                  </div>
                </button>
                <button
                  aria-label={`Options for ${p.name}`}
                  className="absolute right-2 top-2 rounded p-1 text-forge-dim opacity-0 hover:text-forge-ink group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}
                >
                  <MoreVertical size={14} />
                </button>
                {menuFor === p.id && (
                  <div className="absolute right-2 top-8 z-20 w-36 rounded-lg border border-forge-border bg-forge-raised py-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-forge-panel" onClick={async () => { const copy = await duplicateProject(p.id); setMenuFor(null); if (copy) { toast('success', 'Project duplicated.'); navigate(`/project/${copy.id}`); } }}>
                      <Copy size={12} /> Duplicate
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-forge-panel" onClick={async () => { await archiveProject(p.id, !p.archived); setMenuFor(null); toast('success', p.archived ? 'Project restored.' : 'Project archived.'); }}>
                      <Archive size={12} /> {p.archived ? 'Restore' : 'Archive'}
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-forge-err hover:bg-forge-panel" onClick={async () => { await deleteProject(p.id); setMenuFor(null); toast('success', 'Project deleted.'); }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
