// api/ai/highlight.js
const { callReplicateText } = require("./_replicate");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const {
      players = [],
      history = [], // [{rank,suit}, ...]
      roomStats = {},
      locale = "local",
      safeMode = true,
    } = req.body || {};

    const recent = Array.isArray(history) && history.length
      ? history.slice(-6).map(c => `${c.rank}${c.suit}`).join(", ")
      : "—";

    const systemRules = `
Output strictly JSON:
{
  "title": "...",
  "bullets": ["...", "...", "..."],
  "caption": "..."
}
Rules:
- PG, inclusive. No alcohol pressure; prefer "sip/penalty".
- Title <= 60 chars, punchy.
- 3–5 bullets, each <= 90 chars, specific to this session.
- Caption <= 200 chars, fun + subtle CTA.
    `.trim();

    const userPrompt = `
Create a shareable post-game highlight.
Players: ${Array.isArray(players) && players.length ? players.join(", ") : "friends"}
Recent cards: ${recent}
Stats: draws=${roomStats.draws ?? 0}, kings=${roomStats.kings ?? 0}, jacks=${roomStats.jacks ?? 0}, duration=${roomStats.durationMin ?? 0}m
Locale: ${locale}, Safe mode: ${safeMode}
Return JSON only.
    `.trim();

    const text = await callReplicateText({
      modelPath: "openai/gpt-5",
      prompt: `${systemRules}\n\n${userPrompt}`,
      temperature: 0.7,
    });

    let title = "", bullets = [], caption = "";
    try {
      const obj = JSON.parse(text);
      title = obj.title || "";
      bullets = Array.isArray(obj.bullets) ? obj.bullets.slice(0, 5) : [];
      caption = obj.caption || "";
    } catch {
      /* fall back below */
    }

    if (!title) title = "Kings & Chaos (the nice kind)";
    if (!bullets?.length) bullets = [
      "3 Kings drawn — suspense till the end",
      "Top rule: Tiny T-Rex arms stole the show",
      "Categories showdown ran 3 full rounds",
    ];
    if (!caption) caption = "Party highlights unlocked. Ready for round two? Play now →";

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ title, bullets, caption });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ title: "", bullets: [], caption: "" });
  }
};
