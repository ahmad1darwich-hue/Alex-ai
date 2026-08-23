import db from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied;
  return Response.json({ memory: db.prepare("SELECT * FROM memory ORDER BY id DESC").all() });
}

export async function POST(req) {
  const denied = await requireAuth(); if (denied) return denied;
  const { content = "" } = await req.json();
  if (!content.trim()) return Response.json({ error: "Empty memory" }, { status: 400 });
  const info = db.prepare("INSERT INTO memory (content,created_at) VALUES (?,?)")
    .run(content.trim(), new Date().toISOString());
  return Response.json({ id: info.lastInsertRowid });
}

export async function DELETE(req) {
  const denied = await requireAuth(); if (denied) return denied;
  const { id } = await req.json();
  db.prepare("DELETE FROM memory WHERE id=?").run(id);
  return Response.json({ ok: true });
}
