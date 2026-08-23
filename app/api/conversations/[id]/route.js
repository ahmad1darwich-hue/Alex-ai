import db from "../../../../lib/db";
import { requireAuth } from "../../../../lib/auth";

export async function GET(_req, { params }) {
  const denied = await requireAuth(); if (denied) return denied;
  const { id } = await params;
  const conversation = db.prepare("SELECT * FROM conversations WHERE id=?").get(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const messages = db.prepare("SELECT role,content,created_at FROM messages WHERE conversation_id=? ORDER BY id").all(id);
  return Response.json({ conversation, messages });
}

export async function DELETE(_req, { params }) {
  const denied = await requireAuth(); if (denied) return denied;
  const { id } = await params;
  db.prepare("DELETE FROM messages WHERE conversation_id=?").run(id);
  db.prepare("DELETE FROM conversations WHERE id=?").run(id);
  return Response.json({ ok: true });
}
