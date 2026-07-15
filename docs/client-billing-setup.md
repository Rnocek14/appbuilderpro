# Client billing — setup (get paid in ~10 minutes)

This is how you charge **your local-business clients** for the two offers. It's separate from
FableForge's own `/billing` (which charges *you* for Pro). No code or keys needed to start — you use
**Stripe Payment Links**, which Stripe hosts for you.

## The two offers
| Offer | Cadence | Suggested price |
|---|---|---|
| **New Website** | one-time | from $1,500 |
| **Website + Automation** | monthly | from $500/mo |

## Step 1 — create two Payment Links in Stripe (5 min)
1. Stripe dashboard → **Product catalog → Payment links → + New**.
2. **New Website**: add a product "New Website", price it (one-time), create the link.
3. **Website + Automation**: add a product "Website + Automation", price it **recurring / monthly**, create the link.
4. Copy each link (they look like `https://buy.stripe.com/…`).

> Tip: on each Payment Link, turn on "Collect customer email" so you know who paid.

## Step 2 — paste the links into the app (1 min)
Open **Client billing** in the sidebar → **Your Stripe payment links** → paste both → **Save**.
They're reused for every client, so you only do this once.

## Step 3 — sell and track
1. Close a deal (from **Win clients**), then in **Client billing** → **Record a sale** (business, tier, price).
2. Hit **Link** on that row to copy the payment link and send it to the client.
3. When Stripe shows the payment, hit **Mark paid** — the client goes active and your **MRR** updates.

That's it — money in, tracked, honest (MRR counts only active monthly clients).

## Fulfilment (what you do after "Mark paid")
- **New Website**: deploy their rebuilt site (from the preview you pitched).
- **Website + Automation**: import their customer list in **Automations**, turn on the sector automations, and approve the sends. (For your first clients this is hands-on; the autonomous/multi-tenant version is the next phase.)

## Later — fully automated checkout (optional)
When you want card-on-file, auto-activation, and dunning without the manual "Mark paid" step, the
automated path is: a `create-client-checkout` edge function (Stripe Checkout Session per tier) + a
webhook that flips the client active on payment. That needs your **Stripe test keys** wired into the
edge-function secrets so it can be built and tested safely — ping to build it when you're ready. Until
then, Payment Links do the same job with zero risk.
