// src/hooks/usePreviewClaims.ts
// Count of NEW claim requests (business owners who clicked "Claim this website") — the sidebar
// badge that makes a raised hand impossible to miss. Realtime: a claim landing while you're in
// the app updates the badge instantly.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function usePreviewClaims() {
  const { session } = useAuth();
  const [newCount, setNewCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    // RLS scopes rows to previews this user owns; head-count only.
    const { count } = await supabase
      .from('publish_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    setNewCount(count ?? 0);
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`claims-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publish_requests' }, () => void refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  return { newCount, refresh };
}
