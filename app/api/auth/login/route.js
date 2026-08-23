import { createSession } from "../../../../lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req) {
  const { password = "" } = await req.json();
  const expected = process.env.ALEX_AI_PASSWORD || "";
  if (!expected) {
    return Response.json({ error: "ALEX_AI_PASSWORD is not configured." }, { status: 500 });
  }

  const safeA = await bcrypt.hash(expected, 10);
  const ok = await bcrypt.compare(password, safeA);
  if (!ok) return Response.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });

  await createSession();
  return Response.json({ ok: true });
}
