// api/ai/_replicate.js
async function safeJson(resp) {
  try { return await resp.json(); } catch { return null; }
}

// Minimal wrapper for Replicate predictions
// modelPath: e.g., "openai/gpt-5"
async function callReplicateText({ modelPath, prompt, temperature = 0.7 }) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Missing REPLICATE_API_TOKEN");

  const response = await fetch(
    `https://api.replicate.com/v1/models/${modelPath}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait", // block until output ready
      },
      body: JSON.stringify({
        input: {
          // Many text models on Replicate accept "prompt" (single string).
          // We bake system-style rules into the same prompt.
          prompt,
          temperature,
        },
      }),
    }
  );

  if (!response.ok) {
    const maybeErr = await safeJson(response);
    const msg = `Replicate error ${response.status}`;
    console.error(msg, maybeErr);
    throw new Error(maybeErr?.error || msg);
  }

  const prediction = await response.json();

  // Replicate outputs are model-specific; for text it’s commonly a single string
  // or an array of strings/chunks. Normalize to one string.
  let text = "";
  if (prediction?.output) {
    if (Array.isArray(prediction.output)) {
      text = prediction.output.join("");
    } else if (typeof prediction.output === "string") {
      text = prediction.output;
    } else if (prediction.output?.text) {
      text = String(prediction.output.text);
    }
  }

  return text?.trim?.() || "";
}

module.exports = { callReplicateText, safeJson };
