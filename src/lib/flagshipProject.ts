// src/lib/flagshipProject.ts
// "Put it in projects": packages the flagship artist experience as a REAL project — the same
// shape the importer produces — so it appears in the dashboard, opens in the workspace, and
// rides the normal edit/deploy pipeline. The project is a self-contained React app (inline
// styles, react + react-dom only — exactly what PreviewPane provides); the artwork stays on
// the app's own /flagship/ asset paths, absolutized at save time so previews and deploys
// resolve them from anywhere.

import appSource from './flagship/projectApp.txt?raw';
import { supabase } from './supabase';
import { persistImport, type ImportedFile } from './importer';

export const FLAGSHIP_PROJECT_NAME = 'C. Scharpf — Artist Site';
export const FLAGSHIP_PROJECT_DESCRIPTION =
  'Scroll-story portfolio for the imported artwork: gallery tunnel, deep zoom, motion pieces, inquiries.';

const MAIN = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

let el = document.getElementById('root');
if (!el) {
  el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
}
createRoot(el).render(<App />);
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>C. Scharpf — Paintings &amp; Works in Motion</title>
    <meta name="description" content="Original paintings and motion works. Originals and commissions — inquire at the studio." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

/** The project's full file set; `origin` is baked into the artwork URLs at save time. */
export function flagshipProjectFiles(origin: string): ImportedFile[] {
  const clean = origin.replace(/\/+$/, '');
  return [
    { path: 'index.html', content: INDEX_HTML },
    { path: 'src/main.tsx', content: MAIN },
    { path: 'src/App.tsx', content: appSource.replaceAll('__ORIGIN__', clean) },
  ];
}

/** Create the artist site in the signed-in user's projects. Returns the new project id. */
export async function saveFlagshipAsProject(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in to save this site to your projects.');
  return persistImport(
    userId,
    FLAGSHIP_PROJECT_NAME,
    FLAGSHIP_PROJECT_DESCRIPTION,
    flagshipProjectFiles(window.location.origin),
    'flagship artist experience',
  );
}
