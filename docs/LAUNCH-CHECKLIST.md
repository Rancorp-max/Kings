# Human gates: one checklist

Everything below needs you: your OK, your identity, or your name. Nothing here has been done.
Costs are in **CAD at US$1 = C$1.39** (check the day's rate). Nothing over C$50 is needed without your OK, and the all-in cap is C$1,000.

## 1. Money and accounts

| # | Gate | Why | Cost (CAD) | Needs your OK? |
|---|---|---|---|---|
| 1 | **Vercel Pro upgrade** | Hobby is non-commercial only (and allows max 12 functions; this app uses 9). | **C$27.80/month** (US$20) | ✅ Yes |
| 2 | **Firebase project** (Spark/free plan) + service-account key → Vercel env `FIREBASE_SERVICE_ACCOUNT` | Durable storage for parties, purchases and codes. Without it, the preview uses temporary `/tmp` storage. | C$0 (free tier: 50k reads / 20k writes a day) | Your Google account |
| 3 | **Stripe onboarding (KYC)**. Test mode first: set `STRIPE_SECRET_KEY=sk_test_…`, add a webhook for `https://<domain>/api/stripe-webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`) and set `STRIPE_WEBHOOK_SECRET`. After KYC, swap in the live keys and a live webhook. | Card payments. | No monthly fee. Per sale ≈ 2.9% + C$0.30, plus ≈2% conversion if USD is paid out to a CAD account → **≈C$1.30 per US$12.99 pass**, deducted from payouts. | Your identity |
| 4 | **Anthropic API key** with a **monthly spend limit of US$25** → Vercel env `ANTHROPIC_API_KEY` | Personalised questions. Estimated cost ≈ **US$0.03–0.06 per generation** (claude-sonnet-5 writing ~3–5k output tokens + a small claude-haiku-4-5 check; the real per-call cost is logged to `ai_calls` and shown on `/admin`), so US$25 covers roughly 400+ generations. | **≤ C$34.75/month** (hard cap) | ✅ Yes (the limit) |
| 5 | **Custom domain** (optional), e.g. a `.com` at a registrar | Branding/SEO. After buying, update `brand.siteUrl` in `site.config.json` and run `npm run build:pages`. | ≈ **C$15–28/year** | ✅ Yes |
| 6 | **Etsy listing** for access codes | Sales channel. | Listing fee US$0.20 (**C$0.28**, renews every 4 months or on sale); 6.5% transaction fee + ≈3% + C$0.25 payment processing per sale (≈C$1.60 on US$12.99); **US$15 (C$20.85) one-time shop setup fee** only if the shop is new. | Posted under your name |
| 7 | `ADMIN_PASSWORD` on Vercel | Unlocks `/admin`. | C$0 | Pick a strong one |

| 8 | **Weddings: Stripe webhook events.** Add these to the same webhook endpoint: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` (DJ/MC Pro renewals). Also configure the **Customer Portal** in Stripe (Settings → Billing → Customer portal: allow cancel + update card) so DJs can manage their subscription. | Wedding Pass / Plus are one-time payments like the Party Pass; DJ/MC Pro (US$199/yr) is a subscription. | Same Stripe fees: ≈ **C$3.50** per US$49 Pass, ≈ **C$6.80** per US$99 Plus, ≈ **C$12.80** per US$199 licence. Stripe Billing adds **0.7%** on subscriptions (≈C$1.95/yr per licence). | Your identity |
| 9 | **Firebase Blaze (pay-as-you-go)** before any wedding over ~100 guests | A 3-hour, 500-guest event ≈ 130k writes (presence pings every ~50 s + answers) and ≈150k reads. That's over the Spark free tier (20k writes/day) but only **≈US$0.35 (C$0.50) per big event** on Blaze. **Set a budget alert at C$10/month** in Google Cloud Billing. | ≈ C$0–5/month at launch volumes | ✅ Yes (card on file) |
| 10 | **Optional: live updates via Firestore in the browser.** Set `firebaseWeb` in `site.config.json` (web app config) and deploy rules that allow public **read** of `wedding_live/{id}` only (everything else: no client access). Without it, screens poll `/api/wedding?action=live`, which is edge-cached for 1 s; that's fine for 500 guests. | Lower latency, fewer function calls. | C$0 | Your Google account |
| 11 | **Wedding Etsy codes.** `npm run mint-codes -- --count 100 --batch etsy-wed-2026-10 --product wedding` (or `--product wedding_plus`). They're redeemed from the wedding dashboard (the owner pastes the code). Same one-code-per-order fulfilment as section 2. | Etsy sales channel for weddings. | Etsy: 6.5% + ≈3% + C$0.25 per sale → ≈ **C$6.70** on a US$49 code; listing fee C$0.28. | Posted under your name |
| 12 | **Native-speaker review** of the wedding UI strings in `public/js/wedding/i18n.js` (Hindi, Punjabi, Urdu, Gujarati, Tamil, Spanish, French). They're careful drafts, not professional translations. AI-translated questions are shown to the host to edit before approval. | Respect for the families using it. | C$0 if friends/family review; a paid reviewer would need your OK if > C$50 | ✅ Yes if paid |

**Month-1 total:** ≈ **C$63** fixed (Vercel + Anthropic cap) + C$15–28 domain (optional) + up to C$21 Etsy setup ≈ **C$84–112**. That leaves ≈C$890 of the C$1,000 cap. Stripe and Etsy fees come out of sales, not upfront.

## 2. ⚠️ Etsy fulfilment: don't upload the CSV as the download

An Etsy **digital download delivers the same file to every buyer**, so one uploaded file can't hand each buyer a *different* single-use code. Options:
- **Recommended:** list it as a digital item and fulfil each order by sending **one code from `private/codes-etsy-2026-09.csv`** in an Etsy message, marking codes as sent in your own copy. Many sellers do this; it takes a minute per order.
- Or: use an Etsy-approved auto-delivery app that sends one code per order from your list (check the fees first; ask me if it costs more than C$50).
- The download itself can be a PDF with instructions ("Go to <domain>/redeem and enter the code we message you").

The 500 codes are already active: their SHA-256 hashes are in `api/_data/code-hashes.json`, and the plaintext CSV was sent to you separately (it's git-ignored and not in the repo). To mint more: `npm run mint-codes -- --count 500 --batch etsy-2026-10`, then commit and deploy. With Firestore configured, add `--db` for instant activation with no redeploy.

## 3. Anything published under your name — review first

- [ ] `/privacy` and `/terms` (refund policy): these are **drafts**. Check them against your jurisdiction (you're in Canada, so PIPEDA applies) before taking live payments; Stripe also requires a visible refund policy and contact email.
- [ ] Support email shown on the site: currently `rancorp@gmail.com` (`brand.supportEmail`). Change it if you want a separate inbox.
- [ ] The Etsy listing copy and shop details.
- [ ] Google Search Console: verify the domain and submit `/sitemap.xml`.
- [ ] Any social posts or Pinterest pins.
- [ ] **DJ/MC outreach: not done, by design.** The licence, billing and `/games-for-djs-and-mcs` page are built. Nobody has been contacted.
- [ ] The 7 wedding guide pages and `/weddings`: read them once; they make product claims (guest caps, languages, moderation) that match the current build.

## 4. Deploy steps (after the gates above)

1. Set the env vars from `.env.example` in Vercel (Production + Preview).
2. Merge the PR → production deploy.
3. Set `launchDate` in `site.config.json` to that day, run `npm run build:pages`, commit (this starts the Day-7/Day-30 clock).
4. Buy a Pass on the live site with a Stripe **test** card (`4242 4242 4242 4242`) while still in test mode, and confirm it shows on `/admin`.
