
import { createClient } from "@libsql/client";

const url =
  process.env.TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL?.trim();

const authToken =
  process.env.TURSO_AUTH_TOKEN ||
  process.env.TURSO_DATABASE_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing TURSO_DATABASE_URL");
}

const db = createClient({
  url,
  authToken
});

export async function initDb() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'general',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ],
    "write"
  );
}

export default db;
