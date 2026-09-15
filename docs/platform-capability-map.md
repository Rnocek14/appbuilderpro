# What This Platform Can Actually Do — and Why It Feels Broken

**A survey of the whole product, taken from the source.** 219 distinct capabilities catalogued
across ten domains, four real operator journeys traced click by click, every route checked against
the navigation.

**Written for the operator, not for the codebase.** If a capability needs a terminal to switch on,
this document says so, because from where he is sitting a feature he cannot switch on does not exist.

---

## 0. The headline

| Measurement | Number |
|---|---|
| Capabilities catalogued | **219** |
| Reachable from the sidebar | **82** |
| **Not reachable from the sidebar** | **137** |
| Working with no setup at all | **18** |
| Needing setup before they do anything | **97** |
| Partly wired (built, but the chain is broken somewhere) | **49** |
| Dead or duplicated surfaces | **104** |
| Routes in the app | 61 (34 in the sidebar, 8 with no way in) |
| Files that call themselves "the front door" | **11** |

**Of the four journeys an operator would actually want, three break at step 2 and one breaks at the
composer.** Not one of them breaks because the machinery is missing. Every one breaks on a door.

---

## 1. The single root cause

> *"Roughly twenty secret keys have to be typed into the Supabase dashboard by someone comfortable
> with a command line, and a database script has to be pasted in before several of these screens even
> load. A non-technical operator cannot complete any of it alone."*

Three of those keys are the difference between a product and a dead screen, and **none of them has a
field anywhere in the app**:

| Key | What dies without it | Where it can be set |
|---|---|---|
| `ANTHROPIC_API_KEY` | Every scrape, every generated site, every draft | Supabase dashboard only |
| `APP_ORIGIN` | "Build & send" refuses instantly — the demo link would be broken | Supabase dashboard only |
| `WORKER_SECRET` | Reading a prospect's site and finding their email **fails silently** — every prospect ends "demo built, no email found" | Supabase dashboard only |

The app is unusually honest about this **once you find the right page**. It just never points you
there: nothing on Home mentions Setup or Health, and the one checklist that would explain all of it
(`huntReadiness.ts` — which even documents that `APP_ORIGIN` "fails SILENTLY") renders on exactly one
page, buried two levels deep.

**This is the real answer to "anytime I try to do anything I feel like it doesn't work."** It usually
*doesn't* work, the reason is almost always a missing key, and the app only tells you on a page you
have no reason to visit.

---

## 2. The four journeys

### 2.1 Find businesses with bad websites → build them a site → email them

**Verdict: breaks at step 2. Five destinations.**

1. **Sidebar → Prospects** — opens honestly empty, one orange button. *This part is right.*
2. **"Scrape the web (Claude)"** → *"ANTHROPIC_API_KEY is not set — add it in Supabase secrets."*
   **Dead end.** No field in the app accepts that key.
3. The list has **no scoring at all** — businesses with no website sort first and get a badge; there
   is no 0–100 score and no "worst sites first", even though a real grading engine exists
   (`siteAudit.ts`, which honestly refuses to score a site it could not load). That engine runs on
   the *other* page.
4. **The website builder is genuinely deep** — it reads the current site, pulls real photos and a
   public email, screenshots the old page, and runs a strategist → designer → owner-critique →
   refine chain to hand-write a bespoke site.
5. **The built site is live and public immediately** at your own address. No hosting account, no
   publish step. The owner can open it from the email.

**Two corrections to what I told you earlier, both important:**

- **The orange "Build & send" does *not* wait for your approval.** It writes the approval record and
  approves it itself, then sends a real cold email to a real business in the same 30–60 second press.
  The safe path is **clicking the business's name** instead, which opens a drawer with
  "Build the demo (review first)" and leaves the pitch sitting in the Queue until you read it.
  Those two buttons sit inches apart and only one of them is reversible.
- **Seven prerequisites, not all fixable by you.** Three need a terminal (above); four are in the app
  (from-address, mailing address, daily cap, and the master sending switch, which is **off by
  default** on every account).

### 2.2 Publish one social post

**Verdict: works, with setup. Five destinations — but the composer is unfindable.**

> *"There are 34 destinations in the sidebar and not one of them is a post composer."*

The only place to type a social post is a panel called "Post to her accounts", four levels down:
**More → Build → Businesses → open a business → click the one area whose hidden charter happens to be
`social` → scroll past the board.** The ⌘K palette is generated from the same nav list, so typing
"post" or "social" finds nothing. Pick a business template without a social area and the composer
does not exist for you at all — and nothing says why.

The publishing machine behind it is real and honest end to end.

### 2.3 Take on a new client and get paid

**Verdict: breaks at step 2. Thirteen destinations.**

The sidebar offers two doors for the same word — **"Clients"** and **"Client revenue"** — and they
write to **two tables that never join**. "Clients" is the obvious one to click and it is the wrong
one: it has no subscription link and no money fields. Thirteen destinations for one job.

### 2.4 A month of real-estate marketing

**Verdict: breaks at the first click. Nine destinations. And this one is my fault.**

The only real-estate button on the front page — *"Set up Mom's Real Estate marketing"* — builds the
**old twenty-area world, which physically cannot reach the Campaign Studio I built last week**: it has
no `listing_campaign` area, and there is no "add an area" function anywhere in the code.

Worse: that card only renders when you have **zero** businesses. Click the wrong door once and it
disappears, and the correct workspace is never offered again — it lives on the "Businesses" page,
behind the collapsed "More". Two cards there are both real estate with nearly identical names
(**"Mom Real Estate Marketing"** and **"Real Estate Marketing"**), and nothing says one is the live
rail and the other is a map of dead options.

I shipped a working rail and left it unreachable, next to a confusingly-named twin. That is exactly
the disease this document is about, and I added a case of it.

---

## 3. What actually works today with no setup

Eighteen things. The honest list:

- **Home** greets you with what happened while you were away and three things worth doing.
- **The corner bubble** — type a few words, it takes you to the right page and walks you through it.
  It also answers number questions ("how many approvals are waiting", "how much did I make").
- **The Preview Engine** — every demo site you have built, with view counts, screenshots, copy-link,
  delete, and a one-file `.html` download you can hand a paying client.
- **The public demo site and its "what your current website is costing you" report** — what the
  business owner actually opens, no login.
- **Your inbox of people who said yes**, with new → contacted → won/lost.
- **Mission Control** — what the system did today, what it found, what it spent.
- **Memory** — your goals, values and voice; its beliefs with evidence counts.
- **The code editor** — file tree, tabs, version history, project-wide search.
- **Carry a won prospect into billing** with name and email pre-filled.

That is a real product. It is nine things out of 219, and most of them are downstream of a step you
cannot currently complete.

---

## 4. The traps, in order of how much damage they do

1. **Three keys with no field in the app.** Everything else is downstream of this.
2. **"Build & send" sends immediately**, sitting beside a review path that is invisible unless you
   click the name instead of the button.
3. **One press of "Scrape the web" can fire up to 120 paid AI searches** — 60 rounds of 2 areas, many
   minutes of spinner, real money. Running out mid-way reads as a crash.
4. **The clock can be armed and still do nothing.** Arm the heartbeat, watch 13 of 13 jobs go green,
   and if the secret you typed does not match `WORKER_SECRET` the jobs fire and are rejected in
   silence.
5. **Health checks 27 of 73 functions.** "All deployed" is not what it sounds like.
6. **Two setup checklists that disagree** — `/garvis/setup` (5 essentials, real-estate wording) and
   "Ready to hunt & send" on Health (7 prerequisites, prospecting wording).
7. **"Setup" in the sidebar does no setup** — the real configuration is at "Settings", in a different
   section, under a nearly identical name.
8. **Six heartbeat readouts for one fact**, across six pages.
9. **The AI key field in Settings is a dead end** in any real deployment — it saves to your browser
   only. The card admits this in small grey text.
10. **Missing-key failures surface as raw provider text** — `anthropic 401: {...}` — instead of
    "your AI key is missing".

---

## 5. What this means for the redesign

The town is the right instinct, but it is the *second* fix. In order:

**First — make setup possible from inside the app.** One room, in the order that unlocks things, with
a field for every key including the three that currently require a terminal. Until this exists, no
navigation change helps, because the first real button still dead-ends.

**Second — one honest front door.** Eleven files claim to be the front door. Pick one. It opens with:
what needs you, what is running, and what is switched off with the fix beside it.

**Third — seven buildings, one job each.** A job never spans two buildings. The Agency swallows the
finder, the pipeline, the demo builder, the pitch and the replies, because that is one job. Every
building wears a light computed from checks the code already has.

**Fourth — never ship an unreachable rail again.** Both real-estate worlds, the social composer and
the 137 off-nav capabilities are the same bug: a thing built without a door. A new surface is not
done until something in the sidebar leads to it.

**Nothing gets deleted.** All 34 destinations become rooms, still searchable. They stop being
choices you must understand before you can start.
