// src/lib/garvis/studioKit.ts
// THE STUDIO SYSTEM — one shape every studio shares, so Email, Ads, Copy (and the next ones) look and
// behave identically: a gallery of IDEAS, each opening a worked, editable EXAMPLE with several angles.
// This module is the shared contract + the one voice (sign-off, area/business fill, [EDIT] holes), so
// no studio reinvents honesty or tone. Pure — verified by studioKit.verify.ts.
//
// HONESTY (every studio, no exceptions): an example is a real starting draft written from the facts we
// HAVE (business name, who signs it, phone, area). Anything specific we can't know is a visible
// [EDIT: …] hole the owner fills — never invented. Merge fields like {{first_name}} are left intact.

/** What we honestly know about the business a studio belongs to. Shared by every studio's engine. */
export interface StudioCtx {
  businessName: string;
  agentName: string;         // who signs / speaks (often the business itself)
  phone: string | null;
  area: string | null;       // town / neighborhood, if known
  realEstate: boolean;
}

/** One idea in a studio's gallery. `sample` is a teaser shown on the card so ideas are visible up front. */
export interface StudioIdea {
  id: string;
  name: string;
  blurb: string;             // when you'd use it, in plain words
  emoji: string;
  audience: 'realestate' | 'general' | 'both';
  sample: string;            // teaser (may contain {biz}/{area} tokens)
  variants: number;          // how many distinct angles this idea has
}

/** A worked example is a set of labeled fields — {Subject, Body} for email, {Headline, Primary text,
 *  …} for an ad, {Angle, Copy} for messaging. The editor renders one field per part. */
export interface StudioExamplePart { label: string; value: string; multiline?: boolean }
export interface StudioExample { parts: StudioExamplePart[] }

/** A studio = a catalog of ideas + an engine that turns any one into an example. The scaffold
 *  (IdeaStudio.tsx) renders the gallery + editor + save uniformly from this. */
export interface StudioSpec {
  kind: string;                                              // 'email' | 'ads' | 'copy'
  title: string;
  subtitle: string;
  emoji: string;
  savePrefix: string;                                        // artifact title prefix, e.g. "Email"
  ideasFor: (realEstate: boolean) => StudioIdea[];
  sampleFor: (idea: StudioIdea, ctx: StudioCtx) => string;
  build: (ideaId: string, ctx: StudioCtx, variant: number) => StudioExample | null;
}

// ---- the one voice: shared fill helpers ----------------------------------------------------
export const clean = (s: string | null | undefined): string => (s && s.trim() ? s.trim() : '');
export const area = (c: StudioCtx): string => clean(c.area) || '[EDIT: your area]';
export const biz = (c: StudioCtx): string => clean(c.businessName) || clean(c.agentName) || '[EDIT: your business]';

/** The sign-off — real name + business + phone when we have them, a visible hole when we don't. */
export function sign(c: StudioCtx): string {
  const name = clean(c.agentName) || clean(c.businessName) || '[EDIT: your name]';
  const withBiz = clean(c.businessName) && clean(c.businessName) !== name ? `${name}, ${clean(c.businessName)}` : name;
  return `— ${withBiz}${clean(c.phone) ? `\n${clean(c.phone)}` : ''}`;
}

/** Pick by variant (wraps), so "another angle" always returns something and never crashes. */
export const pick = <T,>(arr: T[], v: number): T => arr[((v % arr.length) + arr.length) % arr.length];

/** Fill the tiny {biz}/{area} display tokens used in gallery samples + some fields. Merge fields
 *  ({{…}}) are deliberately left intact for the send path to fill per recipient. */
export function fillTokens(s: string, ctx: StudioCtx): string {
  return s.replace(/\{biz\}/g, biz(ctx)).replace(/\{area\}/g, area(ctx));
}

/** Compose an example's parts into a single copy/save blob (Subject: … \n\n Body …). */
export function exampleToText(ex: StudioExample): string {
  return ex.parts.map((p) => (p.label ? `${p.label}: ${p.value}` : p.value)).join('\n\n');
}

const RE_TITLE = /real.?estate|realtor|realty|listing|propert|broker|\bhomes?\b/i;
/** Infer whether a business is real-estate from its name (used when the caller doesn't say). */
export function inferRealEstate(businessName: string | null | undefined): boolean {
  return RE_TITLE.test(clean(businessName));
}
