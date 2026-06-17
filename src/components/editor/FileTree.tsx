import { useMemo, useState } from 'react';
import { File, FilePlus, Folder, MoreHorizontal, Pencil, Trash2, Sparkles } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { cn } from '../../lib/utils';
import { Input, Button, Modal } from '../ui';

interface Props {
  files: ProjectFile[];
  activePath: string | null;
  onOpen: (path: string) => void;
  onCreate: (path: string) => Promise<void>;
  onRename: (oldPath: string, newPath: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
}

interface TreeNode { name: string; path: string; children?: TreeNode[]; file?: ProjectFile }

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const f of files) {
    const parts = f.path.replace(/^\//, '').split('/');
    let level = root;
    let acc = '';
    parts.forEach((part, i) => {
      acc += '/' + part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part);
      if (!node) {
        node = { name: part, path: acc, children: isFile ? undefined : [], file: isFile ? f : undefined };
        level.push(node);
        level.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name));
      }
      if (!isFile) level = node.children!;
    });
  }
  return root;
}

export function FileTree({ files, activePath, onOpen, onCreate, onRename, onDelete }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const submitCreate = async () => {
    const path = nameInput.startsWith('/') ? nameInput : `/${nameInput}`;
    if (path.length > 1) await onCreate(path);
    setCreating(false);
    setNameInput('');
  };

  const submitRename = async () => {
    if (renaming && nameInput) {
      const next = nameInput.startsWith('/') ? nameInput : `/${nameInput}`;
      await onRename(renaming, next);
    }
    setRenaming(null);
    setNameInput('');
  };

  const renderNode = (node: TreeNode, depth: number) => (
    <li key={node.path}>
      {node.file ? (
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded px-2 py-1 text-[13px] cursor-pointer',
            activePath === node.path ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:bg-forge-raised/60 hover:text-forge-ink',
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onOpen(node.path)}
        >
          <File size={13} className="shrink-0" />
          <span className="flex-1 truncate font-mono">{node.name}</span>
          {node.file.updated_by_ai && <Sparkles size={11} className="shrink-0 text-forge-ember" aria-label="AI modified" />}
          <button
            aria-label={`Options for ${node.name}`}
            className="invisible rounded p-0.5 text-forge-dim hover:text-forge-ink group-hover:visible"
            onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === node.path ? null : node.path); }}
          >
            <MoreHorizontal size={13} />
          </button>
          {menuFor === node.path && (
            <div className="absolute z-20 ml-32 mt-16 w-32 rounded-lg border border-forge-border bg-forge-raised py-1 shadow-xl">
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-forge-ink hover:bg-forge-panel"
                onClick={(e) => { e.stopPropagation(); setRenaming(node.path); setNameInput(node.path); setMenuFor(null); }}
              >
                <Pencil size={12} /> Rename
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-forge-err hover:bg-forge-panel"
                onClick={(e) => { e.stopPropagation(); onDelete(node.path); setMenuFor(null); }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-2 py-1 text-[13px] text-forge-dim" style={{ paddingLeft: 8 + depth * 14 }}>
            <Folder size={13} className="shrink-0 text-forge-ember/70" />
            <span className="font-mono">{node.name}</span>
          </div>
          <ul>{node.children!.map((c) => renderNode(c, depth + 1))}</ul>
        </>
      )}
    </li>
  );

  return (
    <div className="flex h-full flex-col" onClick={() => setMenuFor(null)}>
      <div className="flex items-center justify-between border-b border-forge-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-forge-dim">Files</span>
        <button
          aria-label="New file"
          onClick={() => { setCreating(true); setNameInput(''); }}
          className="rounded p-1 text-forge-dim hover:text-forge-ember"
        >
          <FilePlus size={14} />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto panel-scroll py-1">
        {tree.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-forge-dim">No files yet. Generate the app or add a file to start.</li>
        )}
        {tree.map((n) => renderNode(n, 0))}
      </ul>

      <Modal open={creating} onClose={() => setCreating(false)} title="New file">
        <Input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
          placeholder="/components/Widget.js"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          <Button onClick={submitCreate}>Create file</Button>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename file">
        <Input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitRename()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
          <Button onClick={submitRename}>Rename</Button>
        </div>
      </Modal>
    </div>
  );
}
