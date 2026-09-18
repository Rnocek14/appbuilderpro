// src/lib/frontDoor.ts
// WHERE LOGIN LANDS. The app has two front doors now: Command (the whole platform) and /re (real
// estate only). Which one a browser opens on is a per-browser convenience — the last door this browser
// walked through — never account state: a missing or unreadable value means Command, and nothing is
// worse for it. Only known doors are honored, so a stored value can never become an open redirect.

const KEY = 'front-door';
const DOORS = ['/re', '/garvis/command'] as const;
export type FrontDoor = (typeof DOORS)[number];

export function frontDoor(): FrontDoor {
  try {
    const v = localStorage.getItem(KEY);
    return (DOORS as readonly string[]).includes(v ?? '') ? (v as FrontDoor) : '/garvis/command';
  } catch { return '/garvis/command'; }
}

export function rememberFrontDoor(door: FrontDoor): void {
  try { localStorage.setItem(KEY, door); } catch { /* private window — the default stands */ }
}
