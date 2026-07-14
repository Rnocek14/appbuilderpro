// src/pages/ProfileHome.tsx
// THE FRONT DOOR — your profile as a canvas, the top of the spine. You in the center, your businesses
// orbiting you with their real momentum, ambient nodes for the cross-business things. Tap a business
// and you branch into its canvas. It loads the SAME scene the 3D "cinematic" view uses (loadUniverseScene),
// so the everyday canvas and the wow-view are one truth drawn two ways — no second source, nothing faked.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ProfileCanvas, type BusinessNode } from '../components/garvis/canvas/ProfileCanvas';
import { loadUniverseScene } from '../lib/garvis/universeViewRun';

export default function ProfileHome() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessNode[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    // A failed load must SAY it failed — never render an empty "no businesses" over a network error.
    try {
      setLoadFailed(false);
      const scene = await loadUniverseScene();
      // Real state only. The momentum label is the honest "how it's going"; the made-things badge
      // is the real artifact count read straight out of massEvidence ("N clusters · M artifacts") —
      // never a guess. A business with nothing made yet reads dim, not fake-busy.
      const nodes: BusinessNode[] = scene.bodies.map((b) => {
        const made = b.massEvidence.match(/(\d+)\s+artifacts?/);
        const count = made ? Number(made[1]) : undefined;
        return {
          id: b.id,
          title: b.title,
          sub: b.momentum?.label ?? b.massEvidence,
          count: count && count > 0 ? count : undefined,
          dim: count === 0,
        };
      });
      setBusinesses(nodes);
    } catch {
      setLoadFailed(true);
      setBusinesses(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const name = profile?.full_name || profile?.email || 'You';

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {loadFailed ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-forge-border bg-forge-panel py-20 text-center">
            <AlertTriangle size={22} className="text-forge-warn" />
            <p className="text-sm text-forge-dim">Couldn’t load your command right now.</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
          </div>
        ) : businesses === null ? (
          <div className="flex items-center justify-center py-24"><Spinner label="Opening your command…" /></div>
        ) : (
          <ProfileCanvas
            operatorName={name}
            businesses={businesses}
            onOpenBusiness={(id) => navigate(`/garvis/webs/${id}`)}
            onOpenAmbient={(k) => navigate(k === 'today' ? '/garvis/command' : k === 'queue' ? '/garvis/queue' : '/garvis/money')}
            onNewBusiness={() => navigate('/garvis/webs')}
            onCinematic={() => navigate('/garvis/universe')}
          />
        )}
      </div>
    </AppShell>
  );
}
