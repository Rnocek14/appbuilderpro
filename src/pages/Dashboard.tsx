import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, FolderOpen, Copy, Archive, Trash2, MoreVertical, Hammer, FolderDown } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useProjects } from '../hooks/useProjectData';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Input, SkeletonCard } from '../components/ui';
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : visible.length === 0 ? (
          query || showArchived ? (
            <EmptyState
              icon={<Hammer size={28} />}
              title={query ? 'No matches' : 'No archived projects'}
              body={query ? `Nothing matches “${query}”. Try a different name.` : 'Projects you archive will wait here.'}
            />
          ) : (
            // First run: not a dead end — the three steps from cold forge to shipped site.
            <div className="mx-auto max-w-xl">
              <EmptyState
                icon={<Hammer size={28} />}
                title="The forge is cold — let's fix that"
                body="Three steps from idea to a live site:"
                action={<Link to="/new"><Button><Plus size={15} /> Forge your first app</Button></Link>}
              />
              <ol className="mt-6 space-y-3">
                {[
                  { n: '1', title: 'Describe it', body: 'One sentence is enough — you\'ll pick from three distinct design directions before anything is built.' },
                  { n: '2', title: 'Shape it in chat', body: 'Every change is a message. Attach screenshots, pick elements in the preview, add your own photos via “Use my own photos”.' },
                  { n: '3', title: 'Ship it', body: 'Deploy from the workspace when it feels right. Nothing you generate is wasted — every version is kept.' },
                ].map((s) => (
                  <li key={s.n} className="flex gap-3 rounded-xl border border-forge-border bg-forge-panel/40 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forge-ember/15 font-mono text-sm font-semibold text-forge-ember">{s.n}</span>
                    <div>
                      <p className="text-sm font-medium text-forge-ink">{s.title}</p>
                      <p className="mt-0.5 text-xs text-forge-dim">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )
        ) : (
          <div className="grid gap-3 stagger sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <Card key={p.id} interactive className="group relative p-4">
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
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-forge-panel" onClick={async () => { setMenuFor(null); try { const copy = await duplicateProject(p.id); if (copy) { toast('success', 'Project duplicated.'); navigate(`/project/${copy.id}`); } } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not duplicate the project.'); } }}>
                      <Copy size={12} /> Duplicate
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-forge-panel" onClick={async () => { setMenuFor(null); try { await archiveProject(p.id, !p.archived); toast('success', p.archived ? 'Project restored.' : 'Project archived.'); } catch (e) { toast('error', e instanceof Error ? e.message : 'That failed — nothing was changed.'); } }}>
                      <Archive size={12} /> {p.archived ? 'Restore' : 'Archive'}
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-forge-err hover:bg-forge-panel" onClick={async () => { setMenuFor(null); if (!window.confirm(`Delete “${p.name}”? This can’t be undone — use Archive if you might want it back.`)) return; try { await deleteProject(p.id); toast('success', 'Project deleted.'); } catch (e) { toast('error', e instanceof Error ? e.message : 'Delete failed — the project is untouched.'); } }}>
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
