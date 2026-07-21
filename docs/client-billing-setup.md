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

## Step 3 — turn on auto-publish (2 min, one-time)
So a paid sale records itself **and the site goes live automatically**:
1. Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: the one shown in **Client billing** (`<your-project>.supabase.co/functions/v1/stripe-webhook`).
3. Events to send: **`checkout.session.completed`** (and `checkout.session.async_payment_succeeded`).
4. Save. Copy the signing secret into your Supabase function secrets as `STRIPE_WEBHOOK_SECRET` (same one FableForge already uses — if it's set, you're done).

## Step 4 — connect hosting (2 min, one-time)
So **Go Live** and auto-publish can host sites:
1. Get a **Netlify personal access token** (app.netlify.com → User settings → Applications → New access token).
2. Set it as the Supabase function secret `NETLIFY_AUTH_TOKEN`.

## How a sale flows now (hands-off)
1. You pitch the demo (the email shows a real screenshot). The prospect opens it.
2. On the demo they tap **Make it mine** → **$500/mo** (site + automation) or **$1,500 once**.
3. That sends them straight to your Stripe Payment Link (email prefilled) and records a **pending** sale in **Client billing**.
4. They pay → the webhook flips the sale **active**, updates your **MRR**, and **publishes the site live** (if you'd already hit **Go Live** on it, it's live instantly; otherwise you get a "PAID — click Go Live" ping). You get a `💰 SOLD` notification.

You can still **Record a sale** + **Mark paid** by hand for offline deals — both paths update the same book.

## Hosting a site — one click
On **Preview engine**, each demo row has **Go Live**: your browser renders the finished site and it's hosted on a real URL in seconds (hosting included, per the offer). Publishing it *before* you pitch means a paid sale converts to live instantly. The live URL shows on the row.

## Fulfilment after a sale
- **New Website**: it's already hosted (Go Live / auto-publish). Point their domain when they're ready (Custom domain is supported on publish; they add a DNS record or you do it for them).
- **Website + Automation**: import their customer list in **Automations**, turn on the sector automations, and approve the sends.
