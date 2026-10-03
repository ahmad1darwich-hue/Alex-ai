import { NextRequest, NextResponse } from "next/server";
import { aiCommentary, aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Read-only commentary endpoint. It cannot mutate a signal, and it returns
 * `configured: false` (with no text) when no AI endpoint is set up — the app
 * is fully usable in that state.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string = String(body.prompt ?? "").slice(0, 4000);

  if (!aiConfigured()) {
    return NextResponse.json({
      configured: false,
      text: null,
      message:
        "No AI endpoint is configured. The rule-based analysis on the board is fully functional on its own.",
    });
  }

  if (!prompt.trim()) {
    return NextResponse.json({ configured: true, text: null }, { status: 400 });
  }

  const text = await aiCommentary(prompt);
  return NextResponse.json({ configured: true, text });
}
