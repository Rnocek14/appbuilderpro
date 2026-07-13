// src/hooks/useProjectData.ts
// Data hooks for projects, files, generations, and chat — all with realtime updates.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Project, ProjectFile, Generation, AIMessage, FileVersion } from '../types';

// ---------------- projects ----------------
export function useProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    setProjects((data as Project[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const createProject = async (name: string, templateSlug?: string): Promise<Project | null> => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ owner_id: session!.user.id, name, template_slug: templateSlug ?? null })
      .select().single();
    if (error) {
      console.error('createProject failed:', error);
      throw new Error(`Could not create the project: ${error.message}`);
    }
    await supabase.from('audit_logs').insert({
      actor_id: session!.user.id, action: 'project.create', entity_type: 'project', entity_id: data.id,
    });
    await refresh();
    return data as Project;
  };

  const archiveProject = async (id: string, archived: boolean) => {
    const { error } = await supabase.from('projects').update({ archived }).eq('id', id);
    if (error) throw new Error(error.message);
    await refresh();
  };

  const deleteProject = async (id: string) => {
    // soft delete — the delete itself must surface failure; the audit row stays best-effort
    const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    await supabase.from('audit_logs').insert({
      actor_id: session!.user.id, action: 'project.delete', entity_type: 'project', entity_id: id,
    });
    await refresh();
  };

  const duplicateProject = async (id: string): Promise<Project | null> => {
    const original = projects.find((p) => p.id === id);
    if (!original) return null;
    const { data: copy, error } = await supabase
      .from('projects')
      .insert({ owner_id: session!.user.id, name: `${original.name} (copy)`, description: original.description, status: original.status })
      .select().single();
    if (error) throw new Error(error.message);
    const { data: files } = await supabase
      .from('project_files').select('path, content').eq('project_id', id).is('deleted_at', null);
    if (files?.length) {
      await supabase.from('project_files').insert(
        files.map((f) => ({ project_id: copy.id, path: f.path, content: f.content })),
      );
    }
    await refresh();
    return copy as Project;
  };

  return { projects, loading, refresh, createProject, archiveProject, deleteProject, duplicateProject };
}

// ---------------- files (realtime) ----------------
export function useProjectFiles(projectId: string | undefined) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Discards results from a load that was superseded (e.g. a realtime refire
  // started a newer load while this one was still paging).
  const loadToken = useRef(0);

  // Load every file for the project in pages. A single `select('*')` over a large
  // imported app pulls all file contents at once and can exceed Supabase's 8s
  // statement timeout — which used to fail silently (data=null → files=[]) and
  // leave the preview stuck on "Waiting for project files…". Paging keeps each
  // request small and reliable, and surfaces errors instead of swallowing them.
  // Pages are accumulated and committed once so the preview never sees a partial
  // file set (which would flash a spurious "No entry file found").
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const token = ++loadToken.current;
    setLoading(true);
    setLoadError(null);
    const PAGE = 100;
    const acc: ProjectFile[] = [];
    try {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('project_files')
          .select('id,project_id,path,content,version,updated_by_ai,updated_at')
          .eq('project_id', projectId).is('deleted_at', null)
          .order('path')
          .range(from, from + PAGE - 1);
        if (token !== loadToken.current) return; // a newer load won; drop this one
        if (error) {
          console.error('[useProjectFiles] load failed:', error);
          setLoadError(error.message);
          return; // keep whatever was loaded before; don't clobber with a partial set
        }
        const batch = (data as ProjectFile[]) ?? [];
        acc.push(...batch);
        if (batch.length < PAGE) break; // last page
      }
      if (token === loadToken.current) setFiles(acc);
    } catch (e) {
      if (token === loadToken.current) {
        console.error('[useProjectFiles] load threw:', e);
        setLoadError(e instanceof Error ? e.message : 'Failed to load files');
      }
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`files-${projectId}-${crypto.randomUUID()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_files', filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const saveFile = async (path: string, content: string) => {
    await supabase.from('project_files').upsert(
      { project_id: projectId!, path, content, updated_by_ai: false },
      { onConflict: 'project_id,path' },
    );
    await refresh();
  };

  const createFile = async (path: string) => saveFile(path, '');

  const renameFile = async (oldPath: string, newPath: string) => {
    await supabase.from('project_files')
      .update({ path: newPath })
      .eq('project_id', projectId!).eq('path', oldPath);
    await refresh();
  };

  const deleteFile = async (path: string) => {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId!).eq('path', path);
    await refresh();
  };

  const getVersions = async (fileId: string): Promise<FileVersion[]> => {
    const { data } = await supabase
      .from('project_file_versions').select('*')
      .eq('file_id', fileId).order('version', { ascending: false }).limit(20);
    return (data as FileVersion[]) ?? [];
  };

  return { files, loading, loadError, refresh, saveFile, createFile, renameFile, deleteFile, getVersions };
}

// ---------------- generations (realtime) ----------------
export function useGenerations(projectId: string | undefined) {
  const [generations, setGenerations] = useState<Generation[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('project_generations').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(10);
    setGenerations((data as Generation[]) ?? []);
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`gens-${projectId}-${crypto.randomUUID()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_generations', filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const active = generations.find((g) => g.status === 'running' || g.status === 'queued') ?? null;
  return { generations, active, refresh };
}

// ---------------- chat messages (realtime) ----------------
export function useChatMessages(projectId: string | undefined) {
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('ai_messages').select('*')
      .eq('project_id', projectId).order('created_at');
    setMessages((data as AIMessage[]) ?? []);
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`msgs-${projectId}-${crypto.randomUUID()}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_messages', filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  return { messages, refresh };
}
