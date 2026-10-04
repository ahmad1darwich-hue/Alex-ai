// Static checks of the generated pages (no browser needed).   node nexus-engine/tests/ui.test.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { render, BRAIN_ORIGIN } from "../ui/build-ui.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
function ok(name, cond, detail) {
  if (cond) return console.log("ok   " + name);
  failed++;
  console.log("FAIL " + name + (detail !== undefined ? "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 800) : ""));
}

const built = render();
const onDisk = (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch (e) { return null; } };

// 1. The committed pages are what the sources produce (nobody edited a generated file or forgot to rebuild).
for (const rel of Object.keys(built)) ok("up to date: " + rel, onDisk(rel) === built[rel], "run: node nexus-engine/ui/build-ui.mjs");

// 2. The public page: its policy allows exactly the inline scripts it contains, and nothing else can run.
const nexus = built["indicator-build/index.html"];
const headers = JSON.parse(built["indicator-build/vercel.json"]).headers[0].headers;
const csp = (headers.find((h) => h.key === "Content-Security-Policy") || {}).value || "";
const scripts = [...nexus.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashes = scripts.map((s) => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'");
const scriptSrc = (csp.split(";").map((p) => p.trim()).find((p) => p.startsWith("script-src ")) || "").split(" ").slice(1);
ok("policy lists the hashes of the two inline scripts", scripts.length === 2 && hashes.every((h) => scriptSrc.includes(h)) && scriptSrc.length === 2, { scriptSrc, hashes });
ok("no other script can run", !/unsafe-inline|unsafe-eval|https?:/.test(scriptSrc.join(" ")) && /default-src 'none'/.test(csp));
ok("no script tag with a src and no inline event handler", !/<script[^>]+src=/i.test(nexus) && !/<[^>]+\son[a-z]+\s*=/i.test(nexus.replace(/<script>[\s\S]*?<\/script>/g, "")));
ok("the page may only call itself and the engine", /connect-src 'self' https:\/\/[a-z0-9.-]+$/.test(csp.split(";").map((p) => p.trim()).find((p) => p.startsWith("connect-src ")) || "") && csp.includes(BRAIN_ORIGIN));
ok("the page cannot be framed", /frame-ancestors 'none'/.test(csp) && headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY"));
ok("no secrets or internal hosts in the public page", !/sk-ant-|ANTHROPIC_API_KEY|admin[_-]?token|localhost|127\.0\.0\.1/i.test(nexus));

// 3. Every page: the app script parses, and every text key used in the markup or in t('...') exists in both languages.
for (const [rel, html] of Object.entries(built)) {
  if (!rel.endsWith(".html")) continue;
  const [cfgSrc, appSrc] = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let parsed = true;
  try { new vm.Script(appSrc); } catch (e) { parsed = String(e); }
  ok(rel + ": the app script parses", parsed === true, parsed);
  const cfg = JSON.parse(cfgSrc.replace(/^window\.NEXUS_CONFIG=/, "").replace(/;$/, ""));
  const table = appSrc.slice(appSrc.indexOf("var I18N = {"), appSrc.indexOf("var SUG = ["));
  const keys = new Set([...table.matchAll(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*): \[/g)].map((m) => m[1]).concat(Object.keys(cfg.i18n || {})));
  const used = new Set();
  for (const m of html.replace(/<script>[\s\S]*?<\/script>/g, "").matchAll(/data-i18n(?:-html|-title|-ph|-aria)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of appSrc.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of appSrc.matchAll(/setAttribute\('data-i18n(?:-ph|-aria|-title)?', '([A-Za-z0-9_]+)'\)/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !keys.has(k));
  ok(rel + ": every text key is defined (" + used.size + " used)", used.size > 40 && missing.length === 0, missing);
  const empty = Object.entries(cfg.i18n || {}).filter(([, v]) => !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]).map(([k]) => k);
  ok(rel + ": landing texts have both languages", empty.length === 0, empty);
  ok(rel + ": templates in the gallery", Array.isArray(cfg.templates) && cfg.templates.length === 9 && cfg.templates.every((t) => t.id && t.title.ar && t.title.en && t.blurb.ar && t.blurb.en));
}

// 4. The copy states what the product does. These phrases promise more and must not come back.
const promises = [/works on the first paste/i, /من أول لصقة/, /errors are fixed before/i, /الأخطاء بتتصلّح قبل/, /100\s?%/, /guarantee/i, /مضمون/];
const text = Object.entries(built).filter(([rel]) => rel.endsWith(".html")).map(([, html]) => html.replace(/<style>[\s\S]*?<\/style>/g, "")).join("\n");
const found = promises.filter((re) => re.test(text)).map(String);
ok("no promise the product cannot keep", found.length === 0, found);

console.log(failed ? `\n${failed} check(s) failed` : "\nall UI checks passed");
process.exit(failed ? 1 : 0);
