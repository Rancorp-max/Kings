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
