// api/ai/rule-ideas.js
const { callReplicateText } = require("./_replicate");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const { safeMode = true } = req.body || {};

    const systemRules = `
Output strictly JSON:
{"rules":[{"short":"...","long":"..."}, ...]}
Rules:
- 8 items total.
- PG, inclusive, playful, easy to understand.
- No pressure to drink; use "sip/penalty" vibe.
- "short": <= 60 chars. "long": one short sentence (<= 120 chars).
- Avoid duplicates.
    `.trim();

    const userPrompt = `
Generate 8 new party rule ideas.
Safe mode: ${safeMode}
Return JSON only.
    `.trim();

    const text = await callReplicateText({
      modelPath: "openai/gpt-5",
      prompt: `${systemRules}\n\n${userPrompt}`,
      temperature: 0.8,
    });

    let rules = [];
    try {
      const obj = JSON.parse(text);
      if (Array.isArray(obj.rules)) rules = obj.rules.slice(0, 8);
    } catch {
      /* fall back below */
    }

    if (!rules.length) {
      rules = [
        { short: "No first names", long: "Use nicknames only; slip-ups get a sip/penalty." },
        { short: "Elbow pointing", long: "No pointing with fingers; elbows only!" },
        { short: "Movie quote", long: "Speak one line as a movie quote this round." },
        { short: "Tiny T-Rex arms", long: "Keep elbows tucked while you talk." },
        { short: "Royal accent", long: "Talk posh until your next turn." },
        { short: "No ‘sip’ word", long: "Find another way to say it—be creative!" },
        { short: "Reverse turns", long: "Flip direction for the next 3 draws." },
        { short: "Thumb Master", long: "Last to thumb the table takes a sip/penalty." },
      ];
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ rules });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ rules: [] });
  }
};
