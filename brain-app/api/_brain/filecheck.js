// Brain file check (defensive, nothing is ever run): the real file type from its first bytes versus its name,
// double extensions, Office files that contain macros, password-locked archives, and a SHA-256 fingerprint with a
// VirusTotal link. Edge-compatible. Input: { name, size, data: base64 }.

const RISKY_EXT = /\.(exe|dll|scr|msi|bat|cmd|ps1|vbs|js|jse|wsf|hta|lnk|jar|apk|iso|img|reg)$/i;
const MACRO_EXT = /\.(docm|dotm|xlsm|xltm|xlam|pptm|potm|ppsm)$/i;

function b64ToBytes(b64) {
  const bin = atob(String(b64 || "").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const has = (u8, arr, at = 0) => arr.every((b, i) => u8[at + i] === b);
const ascii = (u8, a, b) => { let s = ""; for (let i = a; i < Math.min(b, u8.length); i++) s += String.fromCharCode(u8[i]); return s; };

export function realType(u8) {
  if (has(u8, [0x4d, 0x5a])) return "program";
  if (has(u8, [0x50, 0x4b, 0x03, 0x04]) || has(u8, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (has(u8, [0xd0, 0xcf, 0x11, 0xe0])) return "old-office";
  if (has(u8, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (has(u8, [0xff, 0xd8, 0xff])) return "jpeg";
  if (has(u8, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (has(u8, [0x52, 0x61, 0x72, 0x21]) || has(u8, [0x37, 0x7a, 0xbc, 0xaf])) return "archive";
  return "other";
}

// Names of the files inside a ZIP-based file (docx/xlsx/pptx/zip), read from its central directory.
export function zipNames(u8) {
  const out = [];
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (has(u8, [0x50, 0x4b, 0x05, 0x06], i)) { end = i; break; }
  if (end < 0) return out;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = dv.getUint32(end + 16, true);
  const n = dv.getUint16(end + 10, true);
  for (let k = 0; k < n && k < 2000 && p + 46 <= u8.length && has(u8, [0x50, 0x4b, 0x01, 0x02], p); k++) {
    const flags = dv.getUint16(p + 8, true), len = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    out.push({ name: ascii(u8, p + 46, p + 46 + len), locked: !!(flags & 1) });
    p += 46 + len + extra + comment;
  }
  return out;
}

export async function checkFile({ name, size, data }) {
  const fname = String(name || "file").slice(0, 120);
  const lines = ["File: " + fname + " (" + Math.round((Number(size) || 0) / 1024) + " KB)"];
  let u8;
  try { u8 = b64ToBytes(data); } catch (e) { return lines.concat(["Could not read the file."]).join("\n- "); }
  const type = realType(u8);
  lines.push("Real type from its first bytes: " + type);
  const ext = (/\.([a-z0-9]{1,6})$/i.exec(fname) || [, ""])[1].toLowerCase();
  if (/\.[a-z0-9]{2,4}\.[a-z0-9]{2,4}$/i.test(fname) && RISKY_EXT.test(fname)) lines.push("WARNING: double extension that hides a program behind a document name");
  if (type === "program" && !/^(exe|dll|msi|scr|sys)$/.test(ext)) lines.push("WARNING: the file is a Windows program but its name says ." + ext);
  if (RISKY_EXT.test(fname)) lines.push("WARNING: this kind of file can run code on a computer — do not open it unless you know exactly where it came from");
  if (MACRO_EXT.test(fname)) lines.push("WARNING: macro-enabled Office file");
  if (type === "zip") {
    const names = zipNames(u8);
    if (names.some((x) => /vbaProject\.bin$/i.test(x.name))) lines.push("WARNING: the Office file contains macros (vbaProject.bin)");
    if (names.some((x) => x.locked)) lines.push("WARNING: password-locked archive (often used to slip past email scanners)");
    const inner = names.filter((x) => RISKY_EXT.test(x.name)).map((x) => x.name).slice(0, 5);
    if (inner.length) lines.push("WARNING: contains files that can run code: " + inner.join(", "));
    lines.push("Files inside: " + names.length);
  }
  if (type === "old-office" && /VBA|Macros/.test(ascii(u8, 0, Math.min(u8.length, 2000000)))) lines.push("WARNING: old-format Office file that appears to contain macros");
  try {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
    const hex = [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
    lines.push("SHA-256: " + hex);
    lines.push("Check it on VirusTotal (no upload needed): https://www.virustotal.com/gui/file/" + hex);
  } catch (e) {}
  if (!lines.some((l) => l.startsWith("WARNING"))) lines.push("No warning signs found in the file's structure (this is not a full antivirus scan).");
  return lines.join("\n- ");
}
