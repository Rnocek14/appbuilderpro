// src/components/garvis/EmailStudio.tsx
// The Email studio = the shared IdeaStudio scaffold plugged with EMAIL_SPEC. Kept as a named
// component because the marketing canvas + WorkWeb mount it by name; all the behavior lives in the one
// scaffold (IdeaStudio) so every studio stays identical.

import { IdeaStudio } from './IdeaStudio';
import { EMAIL_SPEC } from '../../lib/garvis/emailStudio';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function EmailStudio({ worldId, clusterId, onToast, onSaved }: {
  worldId: string; clusterId: string | null; realEstate?: boolean; onToast: Toast; onSaved?: () => void;
}) {
  return <IdeaStudio spec={EMAIL_SPEC} worldId={worldId} clusterId={clusterId} onToast={onToast} onSaved={onSaved} />;
}
