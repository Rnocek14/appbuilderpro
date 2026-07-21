// src/lib/garvis/roomsRun.ts
// Custom Rooms (app_0099): CRUD for apps mounted INSIDE a business. https-only by contract —
// the room renders in a sandboxed iframe, so the URL gate here plus the sandbox attribute are
// the whole trust story for v1.

import { supabase } from '../supabase';

export interface WorldRoom { id: string; world_id: string; title: string; url: string; kind: 'deployed' | 'preview' | 'external'; created_at: string }

export async function listRooms(worldId: string): Promise<WorldRoom[]> {
  const { data, error } = await supabase.from('world_rooms')
    .select('id, world_id, title, url, kind, created_at')
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as WorldRoom[];
}

export async function mountRoom(input: { worldId: string; title: string; url: string; kind?: 'deployed' | 'preview' | 'external' }): Promise<WorldRoom> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const url = input.url.trim();
  if (!/^https:\/\/.+\..+/.test(url)) throw new Error('A room needs a full https:// URL (deploy the app first, then mount its URL).');
  const title = input.title.trim();
  if (!title) throw new Error('Name the room.');
  const { data, error } = await supabase.from('world_rooms').insert({
    owner_id: uid, world_id: input.worldId, title, url, kind: input.kind ?? 'deployed',
  }).select('id, world_id, title, url, kind, created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not mount the room.');
  return data as WorldRoom;
}

export async function unmountRoom(id: string): Promise<void> {
  const { error } = await supabase.from('world_rooms').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
