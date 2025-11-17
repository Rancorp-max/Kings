// api/ai/_replicate.js
async function safeJson(resp) {
  try { return await resp.json(); } catch { return null; }
}

// modelPath example: "openai/gpt-5"
async function callReplicateText({ modelPath, prompt, temperature = 0.7 }) {
  const token = process.env.REPLICATE_API_TOKEN;

  // Soft fallback if missing token: return empty string, callers will use defaults.
  if (!token) {
    console.warn("[AI] Missing REPLICATE_API_TOKEN; returning empty output");
    return "";
  }

  const response = await fetch(
    `https://api.replicate.com/v1/models/${modelPath}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: { prompt, temperature },
      }),
    }
  );

  if (!response.ok) {
    const maybeErr = await safeJson(response);
    console.warn("[AI] Replicate error", response.status, maybeErr);
    return ""; // soft-fail
  }

  const prediction = await response.json();

  let text = "";
  if (prediction?.output) {
    if (Array.isArray(prediction.output)) text = prediction.output.join("");
    else if (typeof prediction.output === "string") text = prediction.output;
    else if (prediction.output?.text) text = String(prediction.output.text);
  }

  return text?.trim?.() || "";
}

module.exports = { callReplicateText, safeJson };
