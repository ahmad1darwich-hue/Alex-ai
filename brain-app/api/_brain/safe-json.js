// JSON for outgoing API bodies. A string cut in the middle of an emoji (a lone UTF-16 surrogate) makes
// JSON.stringify emit "\ud83d" on its own, which the model API rejects ("unexpected end of hex escape") and the
// whole request fails. Lone surrogates are replaced with U+FFFD before serialising.
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const wellFormed = (s) => (typeof s.toWellFormed === "function" ? s.toWellFormed() : s.replace(LONE, "�"));
export function safeStringify(obj) {
  return JSON.stringify(obj, (k, v) => (typeof v === "string" ? wellFormed(v) : v));
}
