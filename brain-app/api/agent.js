// Brain — autonomous agent engine (Vercel serverless function)
// Powered by Claude. Runs a tool-use loop so Brain can plan and build deliverables.
// Requires env var ANTHROPIC_API_KEY (set in Vercel project settings).

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a powerful, autonomous AI agent built for Ahmad. You take any goal and deliver finished work: websites, apps, scripts, documents, analyses, plans, and trading workflows.

How you work:
1. Briefly state a short plan (2-6 numbered steps) for the user's goal.
2. Do the work. When you produce something the user will keep, use or run — a web page, an app, a script, a document, a spreadsheet of data — call the create_artifact tool with the full content. Prefer ONE complete, self-contained artifact (e.g. a single HTML file with inline CSS/JS) unless multiple files are clearly needed.
3. After building, give a 1-3 sentence summary of what you delivered and one suggested next step.

Rules:
- Be decisive and complete — produce real, working output, not placeholders or "you could…".
- For a website/app, make it a complete, self-contained HTML file that runs on its own.
- Keep chat text concise; put the substance in artifacts.
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

async function callClaude(key, messages) {
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, tools: TOOLS, messages })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Anthropic API " + r.status + ": " + t.slice(0, 400));
  }
  return r.json();
}

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;

  // Self-diagnostic: GET /api/agent?diag=uswsbrain2026 runs a live health check.
  if (req.method === "GET") {
    const url = req.url || "";
    if (!url.includes("diag=uswsbrain2026")) {
      res.status(200).json({ ok: true, hasKey: !!key, model: MODEL, note: "POST to chat." });
      return;
    }
    if (!key) { res.status(200).json({ ok: false, hasKey: false, model: MODEL, reason: "no ANTHROPIC_API_KEY set" }); return; }
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 12, messages: [{ role: "user", content: "hi" }] })
      });
      const txt = await r.text();
      res.status(200).json({ ok: r.ok, hasKey: true, model: MODEL, test_status: r.status, test_body: txt.slice(0, 500) });
    } catch (e) {
      res.status(200).json({ ok: false, hasKey: true, model: MODEL, error: String(e).slice(0, 400) });
    }
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const history = Array.isArray(body && body.messages) ? body.messages : [];

  // Demo mode: no key configured yet
  if (!key) {
    res.status(200).json({
      mode: "demo",
      reply: "🔌 Brain is installed but not activated yet.\n\nTo switch on full power, add your Anthropic API key in Vercel:\nProject \"brain\" → Settings → Environment Variables → add ANTHROPIC_API_KEY → Redeploy.\n\nOnce added, ask me to build anything — a website, an app, a report, a trading plan — and I'll deliver it here.",
      artifacts: []
    });
    return;
  }

  try {
    // Convert simple {role,text} history into Anthropic message format
    let messages = history.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : (m.text || "")
    })).filter(m => m.content);

    const artifacts = [];
    let finalText = "";
    let steps = 0;

    while (steps < 6) {
      steps++;
      const resp = await callClaude(key, messages);
      const blocks = resp.content || [];
      const textParts = blocks.filter(b => b.type === "text").map(b => b.text);
      if (textParts.length) finalText += (finalText ? "\n\n" : "") + textParts.join("\n");

      const toolUses = blocks.filter(b => b.type === "tool_use");
      if (resp.stop_reason === "tool_use" && toolUses.length) {
        messages.push({ role: "assistant", content: blocks });
        const results = [];
        for (const tu of toolUses) {
          if (tu.name === "create_artifact") {
            artifacts.push({
              filename: tu.input.filename,
              type: tu.input.type,
              content: tu.input.content
            });
            results.push({ type: "tool_result", tool_use_id: tu.id, content: "Artifact '" + tu.input.filename + "' created and shown to the user." });
          } else {
            results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool.", is_error: true });
          }
        }
        messages.push({ role: "user", content: results });
        continue; // let the model finish its summary
      }
      break; // no more tools; done
    }

    res.status(200).json({ mode: "live", reply: finalText || "Done.", artifacts });
  } catch (e) {
    res.status(200).json({ mode: "error", reply: "⚠️ " + e.message, artifacts: [] });
  }
}
