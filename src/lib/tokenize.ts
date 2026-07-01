// src/lib/tokenize.ts
// Deterministic rewrite of hardcoded Tailwind color classes → shadcn design tokens, so an app
// responds to themes/dark mode as a whole. Pure + dependency-free (so it's unit-testable and
// reusable). Status colors (green/red/amber/yellow/orange) are intentionally LEFT alone — they
// carry meaning. State variants (hover:/focus:/dark:/…) are handled automatically because the
// boundary match catches the bare color token inside a prefixed class.

// Neutral families → surface/text/border tokens.
export const NEUTRAL_FAMILIES = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
// Accent families typically used as the primary action color → map to the theme accent.
export const ACCENT_FAMILIES = ['blue', 'indigo', 'violet', 'purple', 'sky', 'cyan', 'fuchsia'];

export function tokenizeColors(src: string): string {
  let out = src;
  const rep = (token: string, replacement: string) => {
    // \b boundaries so -50 doesn't match inside -500; a variant prefix like "hover:" ends in a
    // non-word ":" so the bare token still matches and is replaced in place.
    out = out.replace(new RegExp('\\b' + token.replace(/[/[\]#]/g, '\\$&') + '\\b', 'g'), replacement);
  };
  for (const c of NEUTRAL_FAMILIES) {
    // Only light surfaces (50–200) → token surfaces. Dark neutral backgrounds (700–950) are
    // LEFT ALONE on purpose: turning a dark header/sidebar into a light token surface while its
    // text stays light = white-on-white. Better to leave a dark element dark than break it.
    rep(`bg-${c}-50`, 'bg-background');
    rep(`bg-${c}-100`, 'bg-muted');
    rep(`bg-${c}-200`, 'bg-muted');
    rep(`text-${c}-950`, 'text-foreground');
    rep(`text-${c}-900`, 'text-foreground');
    rep(`text-${c}-800`, 'text-foreground');
    rep(`text-${c}-700`, 'text-muted-foreground');
    rep(`text-${c}-600`, 'text-muted-foreground');
    rep(`text-${c}-500`, 'text-muted-foreground');
    rep(`text-${c}-400`, 'text-muted-foreground');
    rep(`text-${c}-300`, 'text-muted-foreground');
    rep(`border-${c}-100`, 'border-border');
    rep(`border-${c}-200`, 'border-border');
    rep(`border-${c}-300`, 'border-border');
    rep(`border-${c}-700`, 'border-border');
    rep(`border-${c}-800`, 'border-border');
    rep(`divide-${c}-100`, 'divide-border');
    rep(`divide-${c}-200`, 'divide-border');
    rep(`divide-${c}-700`, 'divide-border');
    rep(`ring-${c}-200`, 'ring-ring');
    rep(`ring-${c}-300`, 'ring-ring');
    rep(`placeholder-${c}-400`, 'placeholder:text-muted-foreground');
    rep(`placeholder-${c}-500`, 'placeholder:text-muted-foreground');
    rep(`from-${c}-50`, 'from-background');
    rep(`from-${c}-100`, 'from-muted');
    rep(`to-${c}-50`, 'to-background');
    rep(`to-${c}-100`, 'to-muted');
  }
  rep('bg-white', 'bg-card');
  rep('bg-black', 'bg-foreground');
  rep('text-black', 'text-foreground');
  // text-white is intentionally kept — correct on colored/primary backgrounds.
  for (const c of ACCENT_FAMILIES) {
    rep(`bg-${c}-50`, 'bg-accent');
    rep(`bg-${c}-100`, 'bg-accent');
    rep(`bg-${c}-200`, 'bg-accent');
    rep(`bg-${c}-400`, 'bg-primary');
    rep(`bg-${c}-500`, 'bg-primary');
    rep(`bg-${c}-600`, 'bg-primary');
    rep(`bg-${c}-700`, 'bg-primary');
    rep(`bg-${c}-800`, 'bg-primary');
    rep(`hover:bg-${c}-500`, 'hover:bg-primary/90');
    rep(`hover:bg-${c}-600`, 'hover:bg-primary/90');
    rep(`hover:bg-${c}-700`, 'hover:bg-primary/90');
    rep(`text-${c}-400`, 'text-primary');
    rep(`text-${c}-500`, 'text-primary');
    rep(`text-${c}-600`, 'text-primary');
    rep(`text-${c}-700`, 'text-primary');
    rep(`hover:text-${c}-600`, 'hover:text-primary/90');
    rep(`hover:text-${c}-700`, 'hover:text-primary/90');
    rep(`border-${c}-400`, 'border-primary');
    rep(`border-${c}-500`, 'border-primary');
    rep(`border-${c}-600`, 'border-primary');
    rep(`ring-${c}-300`, 'ring-ring');
    rep(`ring-${c}-400`, 'ring-ring');
    rep(`ring-${c}-500`, 'ring-ring');
    rep(`from-${c}-500`, 'from-primary');
    rep(`from-${c}-600`, 'from-primary');
    rep(`to-${c}-500`, 'to-primary');
    rep(`to-${c}-600`, 'to-primary');
    rep(`via-${c}-500`, 'via-primary');
  }
  return out;
}
