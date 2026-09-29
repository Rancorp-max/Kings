# PartyDeck 🎉

Party games for baby showers, bridal showers and milestone birthdays (plus King's Cup, 19+). **One host, everyone plays on their phones.**

- **Card deck mode:** themed decks (3 × 64 original cards) and the classic King's Cup with Gentle mode.
- **Quiz mode:** "Who knows [Name] best?", a two-choice "who said it?" round and baby predictions. 20 s timer, live leaderboard, podium.
- **Keepsake:** guests leave advice, wishes and predictions; the host downloads a print-ready PDF (US Letter / A4).
- **Personalised with Claude:** the host adds facts, and `/api/generate-deck` writes quiz questions + 20 custom cards (validated and safety-filtered, and the host edits them).
- **Money:** free for up to 8 players; a US$12.99 **Party Pass** per event (Stripe Checkout or Etsy access codes at `/redeem`) unlocks 40 players, personalisation and a watermark-free keepsake.
- **Weddings (separate option, `/weddings`):** multi-day, multi-event weddings (mehndi/haldi, sangeet, rehearsal/welcome, reception packs) for up to 500 guests per event. Guests join once and keep name, side and points across events (6-digit code to resume on another phone). Owner + 5 co-hosts; a projector screen with a side-vs-side scoreboard and animated finale; 8 languages incl. RTL Urdu; host approval of AI questions and moderation of guest messages; keepsake book (Letter/A4/8×8). **Jackbox-style party games** in every event pack — Quip Clash, Fib Finder, Doodle Duel and Crowd Pulse, with animated big-screen reveals. Pricing: free trial, Wedding Pass US$49, Plus US$99, DJ/MC Pro US$199/yr.
- **Tracking:** first-touch UTM/referrer per party, `purchases` in Firestore, and a password-protected `/admin` dashboard with the kill/double-down rules.

Docs: [architecture](docs/ARCHITECTURE.md) · [kill/double-down rules](docs/RULES.md) · [launch checklist & costs](docs/LAUNCH-CHECKLIST.md)

## Develop

```bash
npm install                      # API deps (Stripe, firebase-admin, Anthropic SDK)
cp .env.example .env.local       # fill what you have; everything degrades gracefully
npm run dev                      # http://localhost:3000 (static site + /api, Vercel-style)
```

With no keys, set `ALLOW_MOCK_PAYMENTS=1` and `MOCK_AI=1` in `.env.local` to click through payments and AI offline. Data goes to `.data/db.json` unless `FIREBASE_SERVICE_ACCOUNT` is set.

**Rename or re-price:** edit `site.config.json`, then `npm run build:pages` (add `-- --og` to re-render social images; needs `cd tests && npm install`).

## Test

```bash
npm test                         # unit: scoring, code redemption, Stripe webhook, JSON validator, PDF, admin stats
cd tests && npm install && cd ..
npm run test:e2e                 # Playwright: King's Cup regression; 1 host + 6 guests quiz with reconnection; free cap + Etsy code + host reload; wedding (owner + co-host + projector + 6 guests, RTL, offline queue, DJ licence); wedding party games (4 games, projector + 5 phones)
npm run test:load                # 500 simulated wedding guests against the dev server: exact tallies + latency p50/p95
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node --test tests/unit/firestore.emulator.mjs   # optional, against the Firestore emulator
```

E2E tests run each player in a separate browser context at 375px, connected over real WebRTC through a local PeerServer (`?peer=localhost:PORT`, honoured only for localhost).

## Deploy

Vercel serves `public/` as-is (see `vercel.json`); functions live in `api/`. Environment variables are listed in `.env.example`.
