import OpenAI from "openai";
import db from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";
import pdf from "pdf-parse";
import mammoth from "mammoth";

export const runtime = "nodejs";

const modeInstructions = {
  general: `You are Alex, a private multilingual executive AI assistant. Respond in the user's language by default. Be practical, concise, and action-oriented.`,
  trading: `You are Alex Trading. Analyze charts, markets, trading plans, risk, and execution workflows. Clearly distinguish observation, inference, and uncertainty. Never claim guaranteed profit or certainty. Do not execute trades unless a separately authorized trading integration is explicitly configured.`,
  landscaping: `You are Alex Landscaping. Help with site reports, quotes, scopes, retaining walls, paving, turf, excavation, drainage, client communication, materials, measurements, and project organization.`,
  business: `You are Alex Business. Help with leads, customer communication, estimates, follow-ups, operations, sales organization, and business documents.`,
  files: `You are Alex Files. Extract, summarize, compare, and organize uploaded files and images accurately. State when file content is unclear or incomplete.`
};

async function fileToModelPart(file) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = file.type || "";
  const name = file.name || "file";

  if (type.startsWith("image/")) {
    if (bytes.length > 8 * 1024 * 1024) throw new Error(`${name}: image is larger than 8 MB`);
    const dataUrl = `data:${type};base64,${bytes.toString("base64")}`;
    return { modelPart: { type: "input_image", image_url: dataUrl }, savedText: `[Image: ${name}]` };
  }

  let text = "";
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdf(bytes);
    text = parsed.text || "";
  } else if (name.toLowerCase().endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({ buffer: bytes });
    text = parsed.value || "";
  } else if (type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(name)) {
    text = bytes.toString("utf8");
  } else {
    throw new Error(`${name}: unsupported file type`);
  }

  text = text.slice(0, 70000);
  return {
    modelPart: { type: "input_text", text: `FILE: ${name}\n\n${text}` },
    savedText: `[File: ${name}]`
  };
}

export async function POST(req) {
  const denied = await requireAuth(); if (denied) return denied;

  try {
    const form = await req.formData();
    const conversationId = String(form.get("conversationId") || "");
    const mode = String(form.get("mode") || "general");
    const message = String(form.get("message") || "").trim();
    const files = form.getAll("files").filter(x => typeof x !== "string");

    if (!conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 });
    if (!message && files.length === 0) return Response.json({ error: "Empty message" }, { status: 400 });

    const conversation = db.prepare("SELECT * FROM conversations WHERE id=?").get(conversationId);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const memories = db.prepare("SELECT content FROM memory ORDER BY id DESC LIMIT 50").all()
      .map(x => `- ${x.content}`).join("\n");

    const previous = db.prepare(
      "SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 14"
    ).all(conversationId).reverse();

    const content = [];
    if (message) content.push({ type: "input_text", text: message });
    const savedRefs = [];

    for (const file of files.slice(0, 5)) {
      const result = await fileToModelPart(file);
      content.push(result.modelPart);
      savedRefs.push(result.savedText);
    }

    const input = previous.map(m => ({ role: m.role, content: m.content }));
    input.push({ role: "user", content });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.ALEX_AI_MODEL || "gpt-5.5",
      instructions:
        (modeInstructions[mode] || modeInstructions.general) +
        (memories ? `\n\nPrivate user memory supplied by the app:\n${memories}` : ""),
      input,
      store: false
    });

    const userSaved = [message, ...savedRefs].filter(Boolean).join("\n");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO messages (conversation_id,role,content,created_at) VALUES (?,?,?,?)")
      .run(conversationId, "user", userSaved, now);
    db.prepare("INSERT INTO messages (conversation_id,role,content,created_at) VALUES (?,?,?,?)")
      .run(conversationId, "assistant", response.output_text, new Date().toISOString());

    const count = db.prepare("SELECT COUNT(*) c FROM messages WHERE conversation_id=?").get(conversationId).c;
    if (count <= 2) {
      const title = (message || files[0]?.name || "محادثة جديدة").slice(0, 46);
      db.prepare("UPDATE conversations SET title=?,mode=?,updated_at=? WHERE id=?")
        .run(title, mode, new Date().toISOString(), conversationId);
    } else {
      db.prepare("UPDATE conversations SET mode=?,updated_at=? WHERE id=?")
        .run(mode, new Date().toISOString(), conversationId);
    }

    return Response.json({ reply: response.output_text });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e?.message || "Alex error" }, { status: 500 });
  }
}
