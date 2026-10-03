/**
 * Optional AI commentary layer.
 *
 * If an OpenAI-compatible endpoint is configured through env vars, we ask it to
 * summarise the situation in plain language. If it is NOT configured, the app
 * still works completely — the deterministic rule engine output stands alone.
 *
 * This layer can only ever produce TEXT. It cannot approve, execute, or place
 * anything.
 */

const BASE_URL = process.env.AI_BASE_URL;
const API_KEY = process.env.AI_API_KEY;
const MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

export function aiConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

export async function aiCommentary(prompt: string): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a market analyst assistant. You summarise evidence. You never tell the user to execute a trade, never promise returns, and always note that the final decision is the user's. Answer in the language of the user's question. Keep it under 120 words.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a YouTube-ready script package for a market update video.
 * Text only — this app has no ability to upload anything.
 */
export function buildVideoScript(ar: boolean, symbol: string, lines: string[]) {
  const title = ar
    ? `تحديث ${symbol}: قراءة فنية سريعة`
    : `${symbol} update: a quick technical read`;
  const description = ar
    ? `قراءة فنية على ${symbol}. هذا محتوى تعليمي وليس نصيحة استثمارية.\n\n${lines.join("\n")}`
    : `A technical read on ${symbol}. Educational content, not investment advice.\n\n${lines.join("\n")}`;
  const tags = [symbol, "crypto", "technical analysis", "تحليل فني", "تداول"];
  return { title, description, tags };
}
