import crypto from "crypto";
import db, { initDb } from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  await initDb();

  const result = await db.execute(
    "SELECT * FROM conversations ORDER BY updated_at DESC"
  );

  return Response.json({ conversations: result.rows });
}

export async function POST(req) {
  const denied = await requireAuth();
  if (denied) return denied;

  await initDb();

  const { mode = "general", title = "محادثة جديدة" } = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: "INSERT INTO conversations (id,title,mode,created_at,updated_at) VALUES (?,?,?,?,?)",
    args: [id, title, mode, now, now]
  });

  return Response.json({
    conversation: {
      id,
      title,
      mode,
      created_at: now,
      updated_at: now
    }
  });
}
