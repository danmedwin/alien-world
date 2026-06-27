// ============================================================================
// Recipe AI backend for the Family Dinner Planner — Cloudflare Worker.
//
// What it does: takes a recipe + a cook's note and returns a revised recipe
// that folds the note in (e.g. "needed 18 min not 8"). The app keeps the old
// version, so this is just the "smart edit" step.
//
// Your Anthropic API key stays SECRET here as an environment variable. It must
// NEVER be put in index.html or committed to GitHub. See RECIPE_AI_SETUP.md.
// ============================================================================

const ALLOW_ORIGIN = "*"; // optional: lock to your site, e.g. "https://yourname.github.io"

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: "invalid JSON body" }, 400); }

    const dish = String(body.dish || "a dish").slice(0, 200);
    const recipe = String(body.recipe || "").slice(0, 4000);
    const note = String(body.note || "").slice(0, 1000);
    if (!note) return json({ error: "no note provided" }, 400);

    const prompt =
      `You are helping a family keep their dinner recipes up to date. Update the recipe ` +
      `below for "${dish}" to incorporate the cook's note. Make the smallest change that ` +
      `captures the note; keep the rest, the tone, and the formatting the same. Do not add ` +
      `commentary or headings. Return ONLY the revised recipe text.\n\n` +
      `CURRENT RECIPE:\n${recipe || "(no recipe yet)"}\n\nCOOK'S NOTE:\n${note}`;

    let r, text;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.MODEL || "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      text = await r.text();
    } catch (e) {
      return json({ error: "could not reach Anthropic", detail: String(e) }, 502);
    }

    if (!r.ok) return json({ error: "anthropic " + r.status, detail: text.slice(0, 500) }, 502);

    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    const out = (data.content && data.content[0] && data.content[0].text) || "";
    return json({ recipe: out.trim() });
  },
};
