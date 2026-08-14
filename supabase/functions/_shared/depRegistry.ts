// supabase/functions/_shared/depRegistry.ts
// ONE dependency truth (verified by src/lib/garvis/depRegistry.verify.ts).
//
// Four surfaces used to each maintain their own copy of "what packages exist and at what
// version": qa.ts's import allowlist, the scaffold's package.json, the blob preview's esm.sh
// pins, and reconcilePackageJson injecting anything unknown at "latest" — four truths that
// could (and did) drift. This registry is the canonical map; the others derive from it or are
// pinned to it by the verify suite.
//
// Versions are EXACT. Consumers add their own range operator (the scaffold ships `^x.y.z`,
// esm.sh wants `@x.y.z`). Bumping a version here is the deliberate act — the verify suite
// makes any consumer that disagrees a CI failure. Upstream rot (a pin esm.sh/npm stops
// serving) is the trade for "latest" breakage; a quarterly manual bump pass is the operator's
// job, and the verify proves internal consistency, not upstream availability.
//
// scope: 'generated' — generated app code may import it (qa.ts allowlist derives from this).
//        'scaffold'  — shipped by the scaffold's motion/3D kit only; generated code that
//                      imports it directly is still flagged by QA (the kit wraps it).

export interface DepPin { version: string; scope: 'generated' | 'scaffold' }

export const DEP_REGISTRY: Record<string, DepPin> = {
  'react': { version: '18.3.1', scope: 'generated' },
  'react-dom': { version: '18.3.1', scope: 'generated' },
  'react-router-dom': { version: '6.26.2', scope: 'generated' },
  'lucide-react': { version: '0.453.0', scope: 'generated' },
  'recharts': { version: '2.13.0', scope: 'generated' },
  '@supabase/supabase-js': { version: '2.45.4', scope: 'generated' },
  'date-fns': { version: '4.1.0', scope: 'generated' },
  'clsx': { version: '2.1.1', scope: 'generated' },
  'class-variance-authority': { version: '0.7.1', scope: 'generated' },
  'tailwind-merge': { version: '2.5.4', scope: 'generated' },
  'framer-motion': { version: '11.11.17', scope: 'generated' },
  'zustand': { version: '5.0.1', scope: 'generated' },
  '@tanstack/react-query': { version: '5.59.16', scope: 'generated' },
  'react-hook-form': { version: '7.53.1', scope: 'generated' },
  'zod': { version: '3.23.8', scope: 'generated' },
  'gsap': { version: '3.12.5', scope: 'generated' },
  'lenis': { version: '1.1.14', scope: 'generated' },
  'three': { version: '0.169.0', scope: 'scaffold' },
  '@react-three/fiber': { version: '8.17.10', scope: 'scaffold' },
  '@react-three/drei': { version: '9.114.3', scope: 'scaffold' },
};

/** The single React version — the preview import map and the scaffold must agree on it. */
export const REACT_VERSION = DEP_REGISTRY['react'].version;

/** Package names generated app code may import (qa.ts's TS allowlist derives from this). */
export function generatedImportable(): string[] {
  return Object.keys(DEP_REGISTRY).filter((name) => DEP_REGISTRY[name].scope === 'generated');
}

/** Exact pin for a package, or null when the registry has never blessed it. */
export function registryPin(name: string): string | null {
  return DEP_REGISTRY[name]?.version ?? null;
}

/** esm.sh pins for the blob preview — everything except the react family, which the preview's
 *  import map pins separately via REACT_VERSION (one shared React instance). */
export function previewPins(): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const [name, { version }] of Object.entries(DEP_REGISTRY)) {
    if (name === 'react' || name === 'react-dom') continue;
    pins[name] = version;
  }
  return pins;
}
