// Keep the deliberately-distinct Builder project and Garvis portfolio app joined through their
// lifecycle. A project remains the editable workspace; an app is the product Garvis monitors.

import { supabase } from '../supabase';

export async function ensurePortfolioAppForProject(projectId: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const { data: existing, error: existingError } = await supabase.from('apps')
    .select('id').eq('project_id', projectId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return (existing as { id: string }).id;

  const { data: project, error: projectError } = await supabase.from('projects')
    .select('name, description').eq('id', projectId).maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error('Project not found.');

  const p = project as { name: string; description: string | null };
  const { data: created, error: createError } = await supabase.from('apps').insert({
    owner_id: uid,
    project_id: projectId,
    name: p.name,
    description: p.description,
    stage: 'building',
    tags: ['fableforge'],
  }).select('id').single();
  if (!createError && created) return (created as { id: string }).id;

  // A second tab may have created the lifecycle row after our first read. Resolve that race by
  // reading the unique owner/project identity instead of creating a duplicate product.
  const { data: raced } = await supabase.from('apps').select('id').eq('project_id', projectId).maybeSingle();
  if (raced) return (raced as { id: string }).id;
  throw new Error(createError?.message ?? 'Could not link the project to the portfolio.');
}

export async function markProjectAppLaunched(projectId: string, deployUrl: string): Promise<string> {
  const appId = await ensurePortfolioAppForProject(projectId);
  const { error } = await supabase.from('apps').update({
    stage: 'launched', deploy_url: deployUrl,
  }).eq('id', appId);
  if (error) throw new Error(error.message);
  return appId;
}
