// src/components/garvis/WorldSenderIdentities.tsx
// Per-business sender identity (app_0085): each brand sends email as ITSELF — its own from-name,
// from-address, reply-to, and footer company. Renders under the global Outreach card in Settings.
// The rule (enforced server-side in send-email): a business with an identity mapped sends as that
// identity, applied as a unit; a business without one sends as the global identity. The mailing
// address may be left blank here to reuse the global CAN-SPAM address. Safety gates — kill
// switch, daily cap, warmup, timezone — stay global on purpose; they govern the human, not the brand.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { listWorlds, type WorldOption } from '../../lib/garvis/brain';
import { useToast } from '../../context/ToastContext';
import { Button, Input } from '../ui';

interface IdentityRow {
  world_id: string; from_name: string | null; from_email: string | null;
  reply_to: string | null; company_name: string | null; physical_address: string | null;
}
type Draft = { from_name: string; from_email: string; reply_to: string; company_name: string; physical_address: string };
const EMPTY: Draft = { from_name: '', from_email: '', reply_to: '', company_name: '', physical_address: '' };

export function WorldSenderIdentities() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [worlds, setWorlds] = useState<WorldOption[] | null>(null);
  const [rows, setRows] = useState<Record<string, IdentityRow>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [ws, { data }] = await Promise.all([
          listWorlds(),
          supabase.from('world_sender_identities')
            .select('world_id, from_name, from_email, reply_to, company_name, physical_address'),
        ]);
        setWorlds(ws);
        setRows(Object.fromEntries(((data ?? []) as IdentityRow[]).map((r) => [r.world_id, r])));
      } catch { setWorlds([]); }
    })();
  }, [open]);

  const startEdit = (worldId: string) => {
    const r = rows[worldId];
    setDraft(r ? {
      from_name: r.from_name ?? '', from_email: r.from_email ?? '', reply_to: r.reply_to ?? '',
      company_name: r.company_name ?? '', physical_address: r.physical_address ?? '',
    } : EMPTY);
    setEditing(worldId);
  };

  const save = async (worldId: string) => {
    if (!draft.from_email.trim()) { toast('error', 'A sender identity needs its own from-address — that’s the whole point.'); return; }
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error('Not signed in.');
      const row = {
        owner_id: uid, world_id: worldId,
        from_name: draft.from_name.trim() || null,
        from_email: draft.from_email.trim(),
        reply_to: draft.reply_to.trim() || null,
        company_name: draft.company_name.trim() || null,
        physical_address: draft.physical_address.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('world_sender_identities').upsert(row, { onConflict: 'world_id' });
      if (error) throw new Error(error.message);
      setRows((m) => ({ ...m, [worldId]: row }));
      setEditing(null);
      toast('success', 'Saved — this business now sends email as itself.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not save the identity.'); }
    finally { setBusy(false); }
  };

  const remove = async (worldId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('world_sender_identities').delete().eq('world_id', worldId);
      if (error) throw new Error(error.message);
      setRows((m) => { const n = { ...m }; delete n[worldId]; return n; });
      setEditing(null);
      toast('info', 'Identity removed — this business sends as the global identity again.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove the identity.'); }
    finally { setBusy(false); }
  };

  const mappedCount = Object.keys(rows).length;

  return (
    <div className="mt-4 border-t border-forge-border pt-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs text-forge-dim hover:text-forge-ink">
        {open ? '▾' : '▸'} Per-business sender identity{mappedCount > 0 ? ` (${mappedCount} mapped)` : ''}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-forge-dim">
            Running more than one brand? Give each its own from-name, from-address, and footer — its
            emails send as that brand instead of the global identity above. Leave the mailing address
            blank to reuse the global one. Caps and the kill switch stay global.
          </p>
          {worlds === null ? (
            <Loader2 size={13} className="animate-spin text-forge-dim" />
          ) : worlds.length === 0 ? (
            <p className="text-[11px] text-forge-dim">No businesses yet — create one first.</p>
          ) : worlds.map((w) => (
            <div key={w.id} className="rounded-lg border border-forge-border p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-forge-ink" title={w.title}>{w.title}</span>
                {rows[w.id] ? (
                  <span className="truncate font-mono text-[11px] text-forge-dim">{rows[w.id].from_email}</span>
                ) : (
                  <span className="text-[11px] text-forge-dim">global identity</span>
                )}
                {editing === w.id ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startEdit(w.id)}>{rows[w.id] ? 'Edit' : 'Set up'}</Button>
                )}
              </div>
              {editing === w.id && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input placeholder="From name (Sue from Lakeside Realty)" value={draft.from_name}
                    onChange={(e) => setDraft((d) => ({ ...d, from_name: e.target.value }))} />
                  <Input placeholder="From email (sue@lakesiderealty.com)" value={draft.from_email}
                    onChange={(e) => setDraft((d) => ({ ...d, from_email: e.target.value }))} />
                  <Input placeholder="Reply-to (optional)" value={draft.reply_to}
                    onChange={(e) => setDraft((d) => ({ ...d, reply_to: e.target.value }))} />
                  <Input placeholder="Company name (footer)" value={draft.company_name}
                    onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))} />
                  <Input className="sm:col-span-2" placeholder="Mailing address (blank = use the global one)" value={draft.physical_address}
                    onChange={(e) => setDraft((d) => ({ ...d, physical_address: e.target.value }))} />
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" loading={busy} disabled={!draft.from_email.trim()} onClick={() => void save(w.id)}>Save identity</Button>
                    {rows[w.id] && <Button size="sm" variant="outline" loading={busy} onClick={() => void remove(w.id)}>Remove</Button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
