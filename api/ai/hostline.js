// api/ai/hostline.js
const { callReplicateText } = require("./_replicate");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const {
      lastCard = { rank: "?", suit: "?" },
      players = [],
      kingsDrawn = 0,
      safeMode = true,
      count = 0,
    } = req.body || {};

    const systemRules = `
Output strictly JSON:
{"line":"..."}
Rules:
- 1–2 sentences total, <= 160 chars.
- PG, kind, inclusive, witty. No alcohol pressure; app uses "sip/penalty".
- Light, friendly references to names are okay; never mock anyone.
    `.trim();

    const userPrompt = `
Create a playful MC line reacting to a draw in a King's Cup style game.
Card: ${lastCard.rank}${lastCard.suit}, Draw #${count}, Kings so far: ${kingsDrawn}
Players: ${Array.isArray(players) && players.length ? players.join(", ") : "friends"}
Safe mode: ${safeMode}
Return JSON only.
    `.trim();

    const text = await callReplicateText({
      modelPath: "openai/gpt-5",
      prompt: `${systemRules}\n\n${userPrompt}`,
      temperature: 0.8,
    });

    let line = "";
    try {
      const obj = JSON.parse(text);
      line = obj.line || "";
    } catch {
      /* fall back below */
    }
    if (!line) line = "Cards don’t lie—cue the chaos (the kind kind)!";

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({ line });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ line: "" });
  }
};
