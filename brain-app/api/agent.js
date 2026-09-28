// Brain — autonomous agent engine (Vercel serverless function)
// Powered by Claude. Runs a tool-use loop so Brain can plan and build deliverables.
// Requires env var ANTHROPIC_API_KEY (set in Vercel project settings).

const MODELS = [
  process.env.BRAIN_MODEL,
  "claude-sonnet-4-5",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest"
].filter(Boolean);
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a powerful, autonomous AI agent built for Ahmad. You take any goal and deliver finished work: websites, apps, scripts, documents, analyses, plans, and trading workflows.

How you work:
1. Briefly state a short plan (2-6 numbered steps) for the user's goal.
2. Do the work. When you produce something the user will keep, use or run — a web page, an app, a script, a document, a spreadsheet of data — call the create_artifact tool with the full content. Prefer ONE complete, self-contained artifact (e.g. a single HTML file with inline CSS/JS) unless multiple files are clearly needed.
3. After building, give a 1-3 sentence summary of what you delivered and one suggested next step.

Rules:
- Be decisive and complete — produce real, working output, not placeholders.
- For a website/app, make it a complete, self-contained HTML file that runs on its own.
- Keep chat text concise; put the substance in artifacts.
- Reply in the same language the user writes in (Arabic or English).
- You do not have live internet or code execution yet (coming soon). If a task truly needs them, say so briefly and deliver the best you can without them.`;

const TOOLS = [{
  name: "create_artifact",
  description: "Create a deliverable file for the user (website, app, script, document, data). Use for anything the user will keep, view, run or download. For a web page/app, provide a complete self-contained HTML file.",
  input_schema: {
    type: "object",
    properties: {
      filename: { type: "string", description: "e.g. index.html, app.py, report.md, data.csv" },
      type: { type: "string", enum: ["html", "code", "markdown", "text", "csv"], description: "html renders in a live preview" },
      content: { type: "string", description: "The full file content." }
    },
    required: ["filename", "type", "content"]
  }
}];

// Try each model until one works; only fall through on model-availability errors.
async function callClaude(key, messages) {
  let lastErr = "no model";
  for (const model of MODELS) {
    let r;
    try {
      r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, tools: TOOLS, messages })
      });
    } catch (e) { lastErr = "network: " + String(e).slice(0, 200); continue; }
    if (r.ok) { const j = await r.json(); j.__model = model; return j; }
    const t = await r.text();
    lastErr = "Anthropic " + r.status + ": " + t.slice(0, 300);
    const modelIssue = r.status === 404 || /model/i.test(t);
    if (!modelIssue) throw new Error(lastErr); // real error (auth, credit, rate) — stop
    // else: try next model
  }
  throw new Error(lastErr);
}

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;

  // Self-diagnostic
  if (req.method === "GET") {
    const url = req.url || "";
    if (!url.includes("diag=uswsbrain2026")) { res.status(200).json({ ok: true, hasKey: !!key, models: MODELS }); return; }
    if (!key) { res.status(200).json({ ok: false, hasKey: false, reason: "no ANTHROPIC_API_KEY set" }); return; }
    const out = [];
    for (const model of MODELS) {
      try {
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 12, messages: [{ role: "user", content: "hi" }] }) });
        const txt = await r.text();
        out.push({ model, status: r.status, ok: r.ok, body: txt.slice(0, 220) });
        if (r.ok) break;
      } catch (e) { out.push({ model, error: String(e).slice(0, 200) }); }
    }
    res.status(200).json({ hasKey: true, results: out });
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  if (!key) {
    res.status(200).json({ mode: "demo", reply: "🔌 Brain is installed but not activated yet.\n\nAdd your Anthropic API key in Vercel: project \"brain\" → Settings → Environment Variables → ANTHROPIC_API_KEY → Redeploy.", artifacts: [] });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const history = Array.isArray(body && body.messages) ? body.messages : [];

  try {
    let messages = history.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : (m.text || "")
    })).filter(m => m.content);
    if (!messages.length) { res.status(200).json({ mode: "live", reply: "Ask Brain to build something 👇", artifacts: [] }); return; }

    const artifacts = [];
    let finalText = "";
    let steps = 0;
    let usedModel = "";

    while (steps < 6) {
      steps++;
      const resp = await callClaude(key, messages);
      usedModel = resp.__model || usedModel;
      const blocks = resp.content || [];
      const textParts = blocks.filter(b => b.type === "text").map(b => b.text);
      if (textParts.length) finalText += (finalText ? "\n\n" : "") + textParts.join("\n");

      const toolUses = blocks.filter(b => b.type === "tool_use");
      if (resp.stop_reason === "tool_use" && toolUses.length) {
        messages.push({ role: "assistant", content: blocks });
        const results = [];
        for (const tu of toolUses) {
          if (tu.name === "create_artifact") {
            artifacts.push({ filename: tu.input.filename, type: tu.input.type, content: tu.input.content });
            results.push({ type: "tool_result", tool_use_id: tu.id, content: "Artifact '" + tu.input.filename + "' created and shown to the user." });
          } else {
            results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool.", is_error: true });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      break;
    }

    res.status(200).json({ mode: "live", model: usedModel, reply: finalText || "Done.", artifacts });
  } catch (e) {
    const msg = String(e.message || e);
    let hint = "";
    if (/401|invalid x-api-key|authentication/i.test(msg)) hint = "\n\n➡️ مفتاح API غير صالح — تحقّق من ANTHROPIC_API_KEY في Vercel.";
    else if (/credit|billing|quota|insufficient|402/i.test(msg)) hint = "\n\n➡️ نفد الرصيد — اشحن حساب Anthropic (console.anthropic.com → Billing).";
    else if (/429|rate/i.test(msg)) hint = "\n\n➡️ تجاوزت الحد مؤقتاً — انتظر دقيقة وحاول مجدداً.";
    else if (/404|model/i.test(msg)) hint = "\n\n➡️ اسم الموديل غير متاح — سأضبط BRAIN_MODEL.";
    res.status(200).json({ mode: "error", reply: "⚠️ Brain hit an error:\n" + msg + hint, artifacts: [] });
  }
}
