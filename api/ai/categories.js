// api/ai/categories.js
const { callReplicateText } = require("./_replicate");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  try {
    const { players = [], locale = "local", safeMode = true } = req.body || {};

    const systemRules = `
You are a party game helper. Output strictly JSON:
{"categories":["...", "...", ...]}
Rules:
- 12 items total.
- Each 1–3 words, PG, inclusive, globally understandable.
- No alcohol encouragement (the app uses "sip/penalty").
- Avoid duplicates and niche references.
    `.trim();

    const userPrompt = `
Make 12 fun "Categories" topics.
Locale: ${locale}
Players: ${Array.isArray(players) && players.length ? players.join(", ") : "friends"}
Safe mode: ${safeMode}

Return JSON only as specified above. No prose, no markdown.
    `.trim();

    const text = await callReplicateText({
      modelPath: "openai/gpt-5",
      prompt: `${systemRules}\n\n${userPrompt}`,
      temperature: 0.7,
    });

    let categories = [];
    try {
      const obj = JSON.parse(text);
      if (Array.isArray(obj.categories)) categories = obj.categories.slice(0, 12);
    } catch {
      /* fall back below */
    }

    if (!categories.length) {
      categories = [
        "Board games","Ice cream flavors","Cartoon characters","Mythical creatures","Pizza toppings","Fruits",
        "Video game characters","Car brands","Sportswear brands","Sea creatures","Breakfast foods","Weather words",
      ];
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ categories });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ categories: [] }); // graceful fallback
  }
};
