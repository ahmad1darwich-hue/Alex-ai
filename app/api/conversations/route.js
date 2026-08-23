import crypto from "crypto";
import db from "../../../lib/db";
import { requireAuth } from "../../../lib/auth";

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied;
  const rows = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all();
  return Response.json({ conversations: rows });
}

export async function POST(req) {
  const denied = await requireAuth(); if (denied) return denied;
  const { mode = "general", title = "محادثة جديدة" } = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO conversations (id,title,mode,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run(id, title, mode, now, now);
  return Response.json({ conversation: { id, title, mode, created_at: now, updated_at: now } });
}
