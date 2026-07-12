// src/hooks/useUnsavedGuard.ts
// Unsaved-work guard (design review, gap-to-9 #6): while a studio holds edits that exist only in
// component state, closing or refreshing the tab asks first. One hook, so every studio inherits
// the same protection. (In-app route changes keep component state through WorkWeb's pane
// switches; the browser-level exits were the data-loss hole.)

import { useEffect } from 'react';

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
