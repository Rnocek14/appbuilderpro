// src/hooks/useProjectData.ts
// Data hooks for projects, files, generations, and chat — all with realtime updates.

import { useCallback, useEffect, useState } from 'react';
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
    await supabase.from('projects').update({ archived }).eq('id', id);
    await refresh();
  };

  const deleteProject = async (id: string) => {
    // soft delete
    await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
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
    if (error) return null;
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

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('project_files').select('*')
      .eq('project_id', projectId).is('deleted_at', null)
      .order('path');
    setFiles((data as ProjectFile[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`files-${projectId}`)
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

  return { files, loading, refresh, saveFile, createFile, renameFile, deleteFile, getVersions };
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
      .channel(`gens-${projectId}`)
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
      .channel(`msgs-${projectId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_messages', filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  return { messages, refresh };
}
