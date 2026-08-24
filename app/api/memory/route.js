import db, { initDb } from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  await initDb();

  const result = await db.execute(
    "SELECT * FROM memory ORDER BY id DESC"
  );

  return Response.json({ memory: result.rows });
}

export async function POST(req) {
  const denied = await requireAuth();
  if (denied) return denied;

  await initDb();

  const { content = "" } = await req.json();

  if (!content.trim()) {
    return Response.json(
      { error: "Empty memory" },
      { status: 400 }
    );
  }

  const result = await db.execute({
    sql: "INSERT INTO memory (content,created_at) VALUES (?,?)",
    args: [content.trim(), new Date().toISOString()]
  });

  return Response.json({
    id: Number(result.lastInsertRowid)
  });
}

export async function DELETE(req) {
  const denied = await requireAuth();
  if (denied) return denied;

  await initDb();

  const { id } = await req.json();

  await db.execute({
    sql: "DELETE FROM memory WHERE id=?",
    args: [id]
  });

  return Response.json({ ok: true });
}
