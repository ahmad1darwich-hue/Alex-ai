// Very small MIME reader: the first text part of a raw message, decoded and trimmed (enough for triage).
function decodeQP(s) { return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))); }
function utf8(bin) { try { return Buffer.from(bin, "latin1").toString("utf8"); } catch (e) { return bin; } }
export function bodyText(source) {
  if (!source) return "";
  const raw = Buffer.isBuffer(source) ? source.toString("latin1") : String(source);
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  let best = "", html = "";
  for (const p of parts.length > 1 ? parts.slice(1) : [raw]) {
    const i = p.search(/\r?\n\r?\n/); if (i < 0) continue;
    const head = p.slice(0, i), bodyRaw = p.slice(i).trim();
    const type = (/content-type:\s*([^;\s]+)/i.exec(head) || [, parts.length > 1 ? "" : "text/plain"])[1].toLowerCase();
    if (!/^text\/(plain|html)$/.test(type)) continue;
    const enc = (/content-transfer-encoding:\s*(\S+)/i.exec(head) || [, ""])[1].toLowerCase();
    let b = bodyRaw;
    if (enc === "base64") { try { b = Buffer.from(b.replace(/\s+/g, ""), "base64").toString("utf8"); } catch (e) {} }
    else if (enc === "quoted-printable") b = utf8(decodeQP(b));
    else b = utf8(b);
    if (type === "text/plain" && !best) best = b; else if (type === "text/html" && !html) html = b;
  }
  let out = best || html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  out = out.split(/\r?\n(?:On .{5,120}wrote:|-----Original Message-----|From: )/)[0];
  return out.replace(/\s+/g, " ").trim().slice(0, 900);
}
export function attachmentNames(source) {
  if (!source) return [];
  const raw = Buffer.isBuffer(source) ? source.toString("latin1") : String(source);
  const out = [];
  for (const m of raw.matchAll(/filename\*?=\s*"?([^";\r\n]+)"?/gi)) if (out.length < 5 && !out.includes(m[1])) out.push(m[1].slice(0, 80));
  return out;
}

