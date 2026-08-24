import OpenAI from "openai";
import db, { initDb } from "../../../lib/db";
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
    if (bytes.length > 8 * 1024 * 1024) {
      throw new Error(`${name}: image is larger than 8 MB`);
    }

    const dataUrl = `data:${type};base64,${bytes.toString("base64")}`;

    return {
      modelPart: {
        type: "input_image",
        image_url: dataUrl
      },
      savedText: `[Image: ${name}]`
    };
  }

  let text = "";

  if (
    type === "application/pdf" ||
    name.toLowerCase().endsWith(".pdf")
  ) {
    const parsed = await pdf(bytes);
    text = parsed.text || "";
  } else if (name.toLowerCase().endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({
      buffer: bytes
    });
    text = parsed.value || "";
  } else if (
    type.startsWith("text/") ||
    /\.(txt|md|csv|json)$/i.test(name)
  ) {
    text = bytes.toString("utf8");
  } else {
    throw new Error(`${name}: unsupported file type`);
  }

  text = text.slice(0, 70000);

  return {
    modelPart: {
      type: "input_text",
      text: `FILE: ${name}\n\n${text}`
    },
    savedText: `[File: ${name}]`
  };
}

function extractMemory(message) {
  const text = String(message || "").trim();

  const patterns = [
    /^remember that\s+(.+)/i,
    /^remember\s+(.+)/i,
    /^please remember that\s+(.+)/i,
    /^تذكر أن\s+(.+)/i,
    /^تذكر ان\s+(.+)/i,
    /^تذكر\s+(.+)/i,
    /^احفظ أن\s+(.+)/i,
    /^احفظ ان\s+(.+)/i,
    /^احفظ\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

export async function POST(req) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    await initDb();

    const form = await req.formData();

    const conversationId = String(
      form.get("conversationId") || ""
    );

    const mode = String(
      form.get("mode") || "general"
    );

    const message = String(
      form.get("message") || ""
    ).trim();

    const files = form
      .getAll("files")
      .filter(x => typeof x !== "string");

    if (!conversationId) {
      return Response.json(
        { error: "Missing conversationId" },
        { status: 400 }
      );
    }

    if (!message && files.length === 0) {
      return Response.json(
        { error: "Empty message" },
        { status: 400 }
      );
    }

    const conversationResult = await db.execute({
      sql: "SELECT * FROM conversations WHERE id=?",
      args: [conversationId]
    });

    const conversation = conversationResult.rows[0];

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const memoryResult = await db.execute(
      "SELECT content FROM memory ORDER BY id DESC LIMIT 50"
    );

    const memories = memoryResult.rows
      .map(x => `- ${x.content}`)
      .join("\n");

    const previousResult = await db.execute({
      sql: `
        SELECT role,content
        FROM messages
        WHERE conversation_id=?
        ORDER BY id DESC
        LIMIT 14
      `,
      args: [conversationId]
    });

    const previous = [...previousResult.rows].reverse();

    const content = [];

    if (message) {
      content.push({
        type: "input_text",
        text: message
      });
    }

    const savedRefs = [];

    for (const file of files.slice(0, 5)) {
      const result = await fileToModelPart(file);
      content.push(result.modelPart);
      savedRefs.push(result.savedText);
    }

    const input = previous.map(m => ({
      role: m.role,
      content: String(m.content)
    }));

    input.push({
      role: "user",
      content
    });

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: process.env.ALEX_AI_MODEL || "gpt-5.5",

      instructions:
        (modeInstructions[mode] || modeInstructions.general) +
        (
          memories
            ? `\n\nPrivate user memory supplied by the app:\n${memories}`
            : ""
        ),

      input,
      store: false
    });

    const userSaved = [
      message,
      ...savedRefs
    ]
      .filter(Boolean)
      .join("\n");

    const now = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT INTO messages
        (conversation_id,role,content,created_at)
        VALUES (?,?,?,?)
      `,
      args: [
        conversationId,
        "user",
        userSaved,
        now
      ]
    });

    await db.execute({
      sql: `
        INSERT INTO messages
        (conversation_id,role,content,created_at)
        VALUES (?,?,?,?)
      `,
      args: [
        conversationId,
        "assistant",
        response.output_text,
        new Date().toISOString()
      ]
    });

    const memoryToSave = extractMemory(message);

    if (memoryToSave) {
      const existingMemory = await db.execute({
        sql: `
          SELECT id
          FROM memory
          WHERE lower(content)=lower(?)
          LIMIT 1
        `,
        args: [memoryToSave]
      });

      if (existingMemory.rows.length === 0) {
        await db.execute({
          sql: `
            INSERT INTO memory
            (content,created_at)
            VALUES (?,?)
          `,
          args: [
            memoryToSave,
            new Date().toISOString()
          ]
        });
      }
    }

    const countResult = await db.execute({
      sql: `
        SELECT COUNT(*) AS c
        FROM messages
        WHERE conversation_id=?
      `,
      args: [conversationId]
    });

    const count = Number(
      countResult.rows[0]?.c || 0
    );

    if (count <= 2) {
      const title = (
        message ||
        files[0]?.name ||
        "محادثة جديدة"
      ).slice(0, 46);

      await db.execute({
        sql: `
          UPDATE conversations
          SET title=?,mode=?,updated_at=?
          WHERE id=?
        `,
        args: [
          title,
          mode,
          new Date().toISOString(),
          conversationId
        ]
      });
    } else {
      await db.execute({
        sql: `
          UPDATE conversations
          SET mode=?,updated_at=?
          WHERE id=?
        `,
        args: [
          mode,
          new Date().toISOString(),
          conversationId
        ]
      });
    }

    return Response.json({
      reply: response.output_text
    });

  } catch (e) {
    console.error(e);

    return Response.json(
      {
        error: e?.message || "Alex error"
      },
      {
        status: 500
      }
    );
  }
}
