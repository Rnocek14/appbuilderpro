// src/lib/projectQA.ts
// DB-backed wrapper around the pure self-QA logic in qaCheck.ts.

import { supabase } from './supabase';
import { isMetaFile } from './projectBrain';
import { validateProject } from './qaCheck';

export { validateProject, issuesToFixRequest } from './qaCheck';
export type { QAIssue } from './qaCheck';

/** Fetch the project's current files and run the static checks over the app source. */
export async function runQA(projectId: string) {
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  return validateProject(appFiles);
}
