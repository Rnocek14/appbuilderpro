// src/lib/garvis/standing.ts
// Client-side door to the standing-orders pure core. The ONE implementation lives in
// supabase/functions/_shared/standingCore.ts (the adsWatchCore pattern): verified by
// standing.verify.ts, executed in the standing-worker edge function, re-exported here so client
// code (standingRun.ts, the panel) imports a clean path.

export * from '../../../supabase/functions/_shared/standingCore';
