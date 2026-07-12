# The Video Pillar — from scripts to real videos

*The audit's one genuinely-absent pillar: video was "scripts only." It now produces a real,
watchable video from a business's OWN photos — playable in the browser with zero setup, and
renderable to a downloadable mp4 when a render key exists. Same honesty spine as everything else:
real artwork only, honest shoot-directions where no photo fits, captions from the actual voiceover
lines — never fabricated footage.*

## What ships

1. **Storyboard compiler** (`storyboard.ts`, pure, 18-check verify) — turns a business's real vault
   photos + a script into a timed, captioned storyboard: a hook card, one scene per photo (its
   caption becomes the voiceover), a closing CTA. Enforces short-form discipline (per-scene 2-6s,
   total ≤ 60s, ≤ 8 scenes), assigns varied Ken-Burns motion, and **guarantees every scene has
   either a real photo OR a visible SHOOT direction — never a blank, never a faked frame.** Emits an
   SRT caption track from the voiceover lines with cumulative timings (a VO-less scene contributes
   no caption — honest).
2. **Browser preview** (`VideoStudio`, mounted in every `video` studio) — a **real, watchable
   Ken-Burns slideshow**: your photos animate with pan/zoom, on-screen text overlays in your brand
   color, progress dots, play/pause, timed to each scene's real duration. **Usable with zero setup.**
   Edit any scene's on-screen text and voiceover; switch aspect (9:16 reel / 1:1 / 16:9); download
   the captions as an `.srt`; save the storyboard as an artifact.
3. **Real mp4 render** (`render-video` edge fn → Shotstack) — `toShotstackEdit(storyboard)` compiles
   the board into the render provider's timeline JSON (image clips with motion effects, title clips
   for text, fade transitions, the chosen aspect/resolution). The key lives in edge env only; the
   client POSTs the edit, polls to completion, and saves the finished mp4 as a `video` artifact in
   the area. **Honest degradation**: no `SHOTSTACK_API_KEY` → the studio says so and points at the
   health page; the browser preview stands regardless.
4. **The producer feeds it** — `gen-video-script` still writes the shot-by-shot script (grounded in
   the world's voice + photos) and now directs the operator into the Video studio to build it into a
   real video.

## The honest boundary (why photo-montage, not AI-generated footage)

The video is built from the business's **own photographed work** — the on-brand, truthful choice
that mirrors what small-business social video actually is (listing reels, portfolio montages, dish
montages). It never generates or hallucinates footage of things that don't exist. Where a beat has
no matching photo, the storyboard shows a **shoot direction** ("shoot: hands working the clay") — a
task for the operator, not a fabricated frame. Captions come from the real voiceover lines. This
keeps video inside the same no-invention spine as research (cited), ads (real limits), and the
website (real artwork).

## Deploy

- `supabase functions deploy render-video` (also in `functions:deploy`).
- Optional secret for real mp4s: `supabase secrets set SHOTSTACK_API_KEY=<key>` (+ `SHOTSTACK_ENV=stage`
  for the free sandbox). The System Health page shows whether it's configured. **The browser preview,
  scene editing, and `.srt` export need none of this.**

*Roadmap beyond this: a text-to-speech voiceover track (the SRT + VO lines are already there), and
an AI-image beat option (behind approval) for scenes with no photo — both additive to this base.*
