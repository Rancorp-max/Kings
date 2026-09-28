#!/usr/bin/env node
/* Generates the static marketing/utility pages from site.config.json so the
 * brand can be renamed in one place:
 *
 *   npm run build:pages            # HTML, sitemap, robots, js/site-config.js
 *   npm run build:pages -- --og    # also render Open Graph PNGs (needs tests/ deps)
 *
 * Outputs are committed (Vercel serves public/ as-is; no build step on deploy).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const site = require('../site.config.json');
const pages = require('./pages/content');

const PUB = path.join(__dirname, '../public');
const B = site.brand;
const URL_ = B.siteUrl.replace(/\/$/, '');
const price = `US$${(site.pricing.passPriceCents / 100).toFixed(2)}`;
const today = new Date().toISOString().slice(0, 10);
const brandify = (s) => String(s).replace(/\{BRAND\}/g, B.name);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (rel, content) => { const f = path.join(PUB, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };

function layout({ slug, title, description, body, jsonld = [], noindex = false, og = slug || 'home', scripts = '', bodyClass = '' }) {
  const canonical = `${URL_}/${slug || ''}`.replace(/\/$/, slug ? '' : '/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${canonical}" />`}
<meta name="theme-color" content="#2a0f5c" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(B.name)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${URL_}/og/${og}.png" />
<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/icons/favicon-48.png" sizes="48x48" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/site.css" />
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
<header class="nav"><a class="logo" href="/">${B.emoji} ${esc(B.name)}</a><nav><a href="/baby-shower-games-on-phones">Baby shower</a><a href="/bridal-shower-games">Bridal shower</a><a href="/40th-birthday-party-games">Birthdays</a><a class="nav-cta" href="/play?host=1">Start a free room</a></nav></header>
${body}
<footer class="foot">
  <div class="foot-links">
    <a href="/baby-shower-games-on-phones">Baby shower games</a><a href="/who-knows-mommy-best">Who knows Mommy best?</a><a href="/bridal-shower-games">Bridal shower games</a><a href="/40th-birthday-party-games">40th birthday games</a><a href="/kings-cup-rules">King's Cup rules</a><a href="/kings-cup-online">King's Cup online</a>
  </div>
  <div class="foot-links small"><a href="/redeem">Redeem a code</a><a href="/privacy">Privacy</a><a href="/terms">Terms &amp; refunds</a><a href="mailto:${esc(B.supportEmail)}">Contact</a></div>
  <p class="small">© ${new Date().getFullYear()} ${esc(B.name)}. Play kindly. King's Cup is for adults of legal drinking age only.</p>
</footer>
<script>addEventListener('load',function(){setTimeout(function(){import('/js/attribution.js').then(function(m){m.captureAttribution();m.trackPageview();});},0);});</script>
${scripts}
</body>
</html>
`;
}

const THEME_CARDS = [
  { theme: 'baby-shower', emoji: '🍼', name: 'Baby Shower', text: '"Who knows the parents best?" quiz, Mom-or-Dad round, baby predictions and advice cards.', link: '/baby-shower-games-on-phones' },
  { theme: 'bridal-shower', emoji: '💍', name: 'Bridal Shower', text: 'How well do you know the bride, who-said-it, sweet advice and story cards.', link: '/bridal-shower-games' },
  { theme: 'milestone-birthday', emoji: '🎂', name: 'Milestone Birthday', text: 'For 30, 40, 50 and 60: stories, toasts and a quiz about the birthday star.', link: '/40th-birthday-party-games' },
  { theme: 'kings-cup', emoji: '👑', name: "King's Cup (19+)", text: 'The classic card game, on everyone\'s phone, with Gentle mode.', link: '/kings-cup-online' },
];

// ------------------------------------------------------------------ home
function home() {
  const faq = [
    { q: 'Do guests need an app or account?', a: 'No. Guests open a link or scan a QR code, choose an avatar and a name, and play in their browser.' },
    { q: 'What does it cost?', a: `Every theme is free for up to ${site.limits.free.maxPlayers} players. A ${site.pricing.passLabel} (${price}, one payment per event) unlocks up to ${site.limits.pass.maxPlayers} players, personalised questions and a keepsake without watermark, valid for ${site.pricing.passDays} days.` },
    { q: 'What is the keepsake?', a: 'Guests leave a piece of advice, a wish or a prediction during the party. The host downloads a print-ready PDF (US Letter or A4) with a cover and one card per guest.' },
    { q: 'Can people join remotely?', a: 'Yes — anyone with the room code can play from anywhere. Share the host screen on a video call for hybrid parties.' },
  ];
  const body = `
<main>
<section class="hero">
  <div class="hero-in">
    <p class="kicker">${esc(B.tagline)}</p>
    <h1>Party games for showers &amp; birthdays — played on everyone's phone</h1>
    <p class="lede">Host on a laptop, tablet or phone. Guests join with a 4-letter code, pick an avatar, and play a quiz about the guest of honour, draw prompt cards and leave notes for a printable keepsake.</p>
    <div class="cta-row"><a class="cta" href="/play?host=1">🎉 Start a free room</a><a class="cta ghost" href="/play">Join a room</a></div>
    <p class="small light">Free for up to ${site.limits.free.maxPlayers} players · no app · no sign-up</p>
  </div>
</section>
<section class="wrap">
  <h2>Pick your party</h2>
  <div class="themes">${THEME_CARDS.map((t) => `<a class="theme" href="/play?theme=${t.theme}"><span class="te">${t.emoji}</span><b>${esc(t.name)}</b><span>${esc(t.text)}</span></a>`).join('')}</div>
  <p class="center small">Guides: ${THEME_CARDS.map((t) => `<a href="${t.link}">${esc(t.name.replace(' (19+)', ''))}</a>`).join(' · ')}</p>
</section>
<section class="wrap how">
  <h2>How it works</h2>
  <ol class="steps">
    <li><b>Set up in minutes.</b> Choose a theme, add the guest of honour's name and pick the quiz or the card deck. Add a few facts and we can write personalised questions for you.</li>
    <li><b>Guests join from their phones.</b> Show the QR code — everyone picks an avatar and a name. No app, no account.</li>
    <li><b>Play together.</b> Questions and cards appear on every phone at once, with a 20-second timer, live leaderboard, reactions and a podium.</li>
    <li><b>Take home a keepsake.</b> Download a print-ready PDF of every guest's advice and wishes for the guest of honour.</li>
  </ol>
</section>
<section class="wrap pricing">
  <h2>Simple pricing</h2>
  <div class="plans">
    <div class="plan-card"><h3>Free</h3><p class="big">$0</p><ul><li>Every theme and game</li><li>Up to ${site.limits.free.maxPlayers} players</li><li>Classic quiz questions</li><li>Keepsake PDF (with a small watermark)</li></ul><a class="cta ghost" href="/play?host=1">Start free</a></div>
    <div class="plan-card best"><h3>${esc(site.pricing.passLabel)}</h3><p class="big">${price}<small> / event</small></p><ul><li>Up to ${site.limits.pass.maxPlayers} players</li><li>Personalised questions &amp; cards written from your facts (${site.limits.pass.generations} generations)</li><li>Keepsake PDF without watermark</li><li>Room valid ${site.pricing.passDays} days</li></ul><a class="cta" href="/play?host=1">Start, upgrade anytime</a></div>
  </div>
  <p class="center small">Bought a code on Etsy? <a href="/redeem">Redeem it here</a>.</p>
</section>
<section class="wrap faq"><h2>Questions</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>
<section class="wrap final"><a class="cta" href="/play?host=1">🎉 Start a free room</a></section>
</main>`;
  return layout({
    slug: '', title: `${B.name} — Party games on everyone's phone for baby showers, bridal showers & birthdays`,
    description: `Host a party game room in seconds. Guests join on their phones for a "who knows them best" quiz, prompt cards and a printable keepsake. Free for up to ${site.limits.free.maxPlayers} players.`,
    body,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: B.name, url: URL_ + '/', applicationCategory: 'GameApplication', operatingSystem: 'Any (web browser)', offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' }, { '@type': 'Offer', price: (site.pricing.passPriceCents / 100).toFixed(2), priceCurrency: 'USD', name: site.pricing.passLabel }] },
      faqLd(faq),
    ],
    scripts: '<script>(function(){var p=new URLSearchParams(location.search);if(p.get("room"))location.replace("/play"+location.search);})();</script>',
  });
}

function faqLd(faq) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: brandify(f.q), acceptedAnswer: { '@type': 'Answer', text: brandify(f.a) } })) };
}

// ------------------------------------------------------------------ SEO pages
function seoPage(p) {
  const cta = `/play?theme=${p.theme}&mode=${p.mode}&utm_source=seo&utm_medium=organic&utm_campaign=${p.slug}`;
  const body = `
<main class="article">
  <header class="art-head"><div class="art-emoji">${p.emoji}</div><h1>${esc(brandify(p.h1))}</h1><p class="lede">${esc(brandify(p.lede))}</p>
    <a class="cta" href="${cta}">Start a free room →</a></header>
  ${p.sections.map((s) => `<section><h2>${esc(brandify(s.h2))}</h2>${brandify(s.html)}</section>`).join('\n  ')}
  <section class="faq"><h2>Frequently asked questions</h2>${p.faq.map((f) => `<details open><summary>${esc(brandify(f.q))}</summary><p>${esc(brandify(f.a))}</p></details>`).join('')}</section>
  <section class="final"><h2>Ready to play?</h2><p>Free for up to ${site.limits.free.maxPlayers} players. No app, no sign-up — guests join with a code.</p><a class="cta" href="${cta}">Start a free room</a></section>
</main>`;
  return layout({
    slug: p.slug, title: brandify(p.title), description: brandify(p.description), body,
    jsonld: [faqLd(p.faq), { '@context': 'https://schema.org', '@type': 'Article', headline: brandify(p.h1), description: brandify(p.description), dateModified: today, publisher: { '@type': 'Organization', name: B.name } }],
  });
}

// ------------------------------------------------------------------ utility pages
function simplePage({ slug, title, description, body, noindex = true, scripts = '' }) {
  return layout({ slug, title: `${title} — ${B.name}`, description, body, noindex, scripts, bodyClass: 'utility' });
}

const redeem = () => simplePage({
  slug: 'redeem', title: 'Redeem your access code', description: `Redeem a ${B.name} ${site.pricing.passLabel} code bought on Etsy.`, noindex: false,
  body: `<main class="card-page"><h1>🎟️ Redeem your code</h1><p>Bought a ${esc(site.pricing.passLabel)} code on Etsy? Enter it below to unlock up to ${site.limits.pass.maxPlayers} players, personalised questions and a watermark-free keepsake for one event.</p>
  <form id="redeemForm"><label for="code">Your code</label><input id="code" name="code" placeholder="PD-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" required /><button class="cta" type="submit">Unlock my ${esc(site.pricing.passLabel)}</button></form>
  <p class="err" id="err" role="alert"></p><div id="ok" class="ok hidden"><h2>🎉 You're all set!</h2><p id="okText"></p><a class="cta" href="/play?host=1">Set up your party →</a></div>
  <p class="small">Codes are single-use and tied to the party you redeem them for. Problems? Email <a href="mailto:${esc(B.supportEmail)}">${esc(B.supportEmail)}</a>.</p></main>`,
  scripts: '<script type="module" src="/js/redeem.js"></script>',
});

const results = () => simplePage({
  slug: 'results', title: 'Baby prediction results', description: 'Score the baby predictions from your shower.',
  body: `<main class="card-page"><h1>🔮 Baby prediction results</h1><p>Enter the real details and we'll find the closest guess for each one. Only the host's device can open this page.</p><div id="resultsApp"><p>Loading…</p></div></main>`,
  scripts: '<script type="module" src="/js/results.js"></script>',
});

const admin = () => simplePage({
  slug: 'admin', title: 'Admin', description: 'Admin dashboard',
  body: `<main class="wide"><h1>📊 ${esc(B.name)} admin</h1><form id="login" class="row"><input type="password" id="pw" placeholder="Admin password" autocomplete="current-password" /><button class="cta">Open dashboard</button></form><p class="err" id="err"></p><div id="dash"></div></main>`,
  scripts: '<script type="module" src="/js/admin.js"></script>',
});

const privacy = () => simplePage({
  slug: 'privacy', title: 'Privacy policy', description: `How ${B.name} handles data.`, noindex: false,
  body: `<main class="article"><h1>Privacy policy</h1><p class="small">Last updated ${today}. Draft — please review before relying on it.</p>
<h2>What we collect</h2><ul>
<li><strong>Game data stays on devices.</strong> Names, avatars, answers and keepsake notes travel directly between the host's and guests' browsers (peer-to-peer) and are stored only in the host's browser. We do not store keepsake notes on our servers.</li>
<li><strong>Party records.</strong> When a host sets up a party we store: the theme and mode, the guest(s) of honour's names and date if entered, plan status, the number of players, and baby predictions if the host saves them for later scoring.</li>
<li><strong>Attribution.</strong> We record how the host found us (UTM tags and the referring website) with the party, and count anonymous page views per page per day. No cookies are used for this and no IP addresses are stored.</li>
<li><strong>Payments.</strong> Card payments are processed by Stripe; we never see or store card numbers. We keep the amount, date and party id.</li>
<li><strong>Personalised questions.</strong> If a host uses AI personalisation, the facts they type and the guest(s) of honour's names are sent to Anthropic to generate questions. Don't enter sensitive information.</li></ul>
<h2>Your choices</h2><p>Guests can play with any nickname. Hosts can ask us to delete a party record by emailing <a href="mailto:${esc(B.supportEmail)}">${esc(B.supportEmail)}</a> with the party code or date.</p>
<h2>Children</h2><p>${esc(B.name)} is intended for use by adults hosting family events. King's Cup is restricted to adults of legal drinking age.</p></main>`,
});

const terms = () => simplePage({
  slug: 'terms', title: 'Terms & refunds', description: `Terms of use and refund policy for ${B.name}.`, noindex: false,
  body: `<main class="article"><h1>Terms of use &amp; refunds</h1><p class="small">Last updated ${today}. Draft — please review before relying on it.</p>
<h2>The service</h2><p>${esc(B.name)} provides party games played in a web browser. The free plan supports up to ${site.limits.free.maxPlayers} players. A ${esc(site.pricing.passLabel)} (${price}, a single payment per event) unlocks the features described at checkout for ${site.pricing.passDays} days from purchase.</p>
<h2>Refunds</h2><p>If the ${esc(site.pricing.passLabel)} did not work for your event, email <a href="mailto:${esc(B.supportEmail)}">${esc(B.supportEmail)}</a> within 14 days of purchase and we'll refund you. Etsy code purchases are refunded through Etsy.</p>
<h2>Content</h2><p>Hosts are responsible for the questions, facts and notes they enter. AI-written questions are reviewed automatically but may still contain mistakes — hosts can edit or remove any question before playing.</p>
<h2>King's Cup</h2><p>King's Cup is for adults of legal drinking age (19+ in most of Canada). Drink responsibly; any sip can be a non-alcoholic drink or a light penalty. Never drink and drive.</p>
<h2>Connectivity</h2><p>Games run peer-to-peer between browsers; the host must keep the game open. Some restrictive networks block these connections.</p></main>`,
});

const notFound = () => layout({ slug: '404', title: `Page not found — ${B.name}`, description: 'Page not found', noindex: true, bodyClass: 'utility', body: `<main class="card-page center"><h1>🎈 This page floated away</h1><p>Let's get you back to the party.</p><a class="cta" href="/">Go home</a></main>` });

// ------------------------------------------------------------------ build
function build() {
  const cfg = { ...site }; delete cfg._comment;
  write('js/site-config.js', `// GENERATED from site.config.json by scripts/build-pages.js — edit that file, not this one.\nexport const SITE = ${JSON.stringify(cfg, null, 2)};\n`);
  write('index.html', home());
  for (const p of pages) write(`${p.slug}.html`, seoPage(p));
  write('redeem.html', redeem()); write('results.html', results()); write('admin.html', admin());
  write('privacy.html', privacy()); write('terms.html', terms()); write('404.html', notFound());
  const urls = ['', ...pages.map((p) => p.slug), 'redeem', 'privacy', 'terms'];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${URL_}/${u}</loc><lastmod>${today}</lastmod><changefreq>${u ? 'monthly' : 'weekly'}</changefreq><priority>${u ? (pages.some((p) => p.slug === u) ? '0.8' : '0.3') : '1.0'}</priority></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /results\nDisallow: /mock-checkout\n\nSitemap: ${URL_}/sitemap.xml\n`);
  // Word counts (the brief asks for 600–900 words per SEO page).
  for (const p of pages) {
    const text = brandify([p.h1, p.lede, ...p.sections.map((s) => s.h2 + ' ' + s.html), ...p.faq.map((f) => f.q + ' ' + f.a)].join(' ')).replace(/<[^>]+>/g, ' ');
    console.log(`${p.slug.padEnd(30)} ${text.split(/\s+/).filter(Boolean).length} words`);
  }
  console.log('Pages written to public/.');
}

async function ogImages() {
  const { chromium } = require(path.join(__dirname, '../tests/node_modules/playwright'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const items = [
    { id: 'home', emoji: '🎉', title: "Party games on everyone's phone", sub: 'Baby showers · Bridal showers · Milestone birthdays' },
    ...pages.map((p) => ({ id: p.slug, emoji: p.emoji, title: brandify(p.h1), sub: p.adult ? '19+ · Free on your phones' : 'Free for up to 8 players · No app needed' })),
  ];
  fs.mkdirSync(path.join(PUB, 'og'), { recursive: true });
  for (const it of items) {
    await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff;background:radial-gradient(120% 120% at 20% 0%,#7a2cff 0%,#2a0f5c 55%,#12062e 100%)">
      <div style="font-size:120px;line-height:1">${it.emoji}</div>
      <div style="font-size:64px;font-weight:800;line-height:1.1;margin:24px 0 18px;max-width:1000px">${esc(it.title)}</div>
      <div style="font-size:32px;opacity:.85">${esc(it.sub)}</div>
      <div style="position:absolute;right:90px;bottom:60px;font-size:36px;font-weight:800;color:#ffc83d">${esc(B.emoji + ' ' + B.name)}</div></body></html>`);
    await page.screenshot({ path: path.join(PUB, 'og', `${it.id}.png`) });
  }
  await browser.close();
  console.log(`OG images: ${items.length} written to public/og/.`);
}

build();
if (process.argv.includes('--og')) ogImages().catch((e) => { console.error(e); process.exit(1); });
