# Kill / double-down rules

These rules are also evaluated live on the `/admin` dashboard. Day 0 is `launchDate` in
`site.config.json`; if that isn't set, it's the first recorded page view or party.
**Set `launchDate` on the day the production deploy goes live.**

| When | Signal (from `/admin`) | If below the bar | If at or above the bar |
|---|---|---|---|
| **Day 7** | Landing-page visits (the 7 marketing pages, headless bots excluded) | **< 100 visits:** rewrite the `<title>` and meta description of the **3 weakest pages** (the dashboard lists them). Edit `scripts/pages/content.js`, run `npm run build:pages`, deploy. | Keep going; no change. |
| **Day 30** | Paid events (Stripe + Etsy codes; test-mode purchases excluded) | **< 10 paid events:** drop the paid tier. Set `limits.free` to the Pass values and remove the upsell, and keep the free game running as a traffic feeder. | **≥ 10 paid events:** add **retirement** and **anniversary** themes (new deck JSON + `THEMES` entry + SEO page), then test **US$14.99** by changing `pricing.passPriceCents` to `1499`. |

## How to run each action

- **Rewrite titles/meta:** in `scripts/pages/content.js`, change `title` and `description`. Lead with the exact phrase people search for, then the benefit ("free", "on phones", "no printing"). Run `npm run build:pages` and re-submit the sitemap in Google Search Console.
- **Drop the paid tier:** in `site.config.json`, set `limits.free.maxPlayers` to `40`, `watermark: false`, `aiQuestionsPlayable: 99`, then rebuild the pages. The Stripe webhook can stay in place for refunds.
- **Test US$14.99:** change `pricing.passPriceCents` and rebuild the pages. Compare conversion by source on `/admin` over the following 30 days.

## Weddings (added with the wedding mode)

Evaluated on `/admin` as **Day 30 — weddings**. "Paid weddings" counts Wedding Pass / Plus purchases and wedding Etsy codes. DJ/MC licences are shown separately. Test-mode purchases are excluded.

| When | Signal (from `/admin`) | Action |
|---|---|---|
| **Day 30** | **≥ 3 paid weddings** | **Double down:** prioritise the **DJ/MC Pro licence** (you do the outreach; the product side is built: `/dj`, `/games-for-djs-and-mcs`) and **South Asian packs**: more mehndi/sangeet/haldi content, Gujarati/Tamil/Punjabi pack variants, and native-speaker review of the translations. |
| **Day 30** | **0 paid weddings** but **≥ 10 paid shower/birthday events** | **Park weddings:** remove "Weddings" from the nav and footer in `scripts/build-pages.js`, add `noindex` to the wedding guide pages, rebuild, and keep the code in place (existing weddings keep working). Put the time into the party themes. |
| **Day 30** | Anything else | Keep both running; re-check at Day 60. |

Also watch the per-wedding tracking on `/admin` (events run, guests joined, peak concurrent players, keepsake downloads, and which event the purchase started from). If purchases mostly start from one event type (e.g. sangeet), lead the `/weddings` page and ads with that event.
