#!/usr/bin/env node
// Downloads the ten clips of the Drive folder "circle / video" into public/videos/.
//
//   node tools/fetch-videos.mjs            # all ten
//   node tools/fetch-videos.mjs --only 3   # just one (by 1-based index)
//   node tools/fetch-videos.mjs --list     # print what would be fetched
//
// Run this from a machine that can reach Google Drive (the sandbox that builds
// the app cannot). Files land in public/videos/, which is where VIDEO_SOURCES
// in src/intro/config.ts points. Anything missing simply keeps its generated
// slate — the intro never breaks because of an absent asset.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const CONFIG = path.join(ROOT, "src/intro/config.ts");
const OUT = path.join(ROOT, "public/videos");

/** Pull `{ file: "...", driveId: "..." }` pairs straight out of the config. */
function readClips() {
  const src = fs.readFileSync(CONFIG, "utf8");
  const re = /\{\s*file:\s*"([^"]+)",\s*driveId:\s*"([^"]+)",\s*title:\s*"([^"]*)"\s*\}/g;
  const clips = [];
  let m;
  while ((m = re.exec(src))) clips.push({ file: m[1], driveId: m[2], title: m[3] });
  if (!clips.length) throw new Error(`no VIDEO_CLIPS found in ${CONFIG}`);
  return clips;
}

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Drive > 25 MB answers with an HTML confirm page; rebuild its form as a GET. */
function confirmUrl(html, id) {
  const form = /<form[^>]+action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/.exec(html);
  if (form) {
    const action = form[1].replace(/&amp;/g, "&");
    const inputs = [...form[2].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)];
    const params = new URLSearchParams();
    for (const [, name, value] of inputs) params.set(name, value.replace(/&amp;/g, "&"));
    if (!params.has("id")) params.set("id", id);
    if (!params.has("export")) params.set("export", "download");
    return `${action}${action.includes("?") ? "&" : "?"}${params.toString()}`;
  }
  const token = /confirm=([0-9A-Za-z_-]+)/.exec(html);
  const uuid = /uuid=([0-9A-Za-z_-]+)/.exec(html);
  const params = new URLSearchParams({ export: "download", id });
  if (token) params.set("confirm", token[1]);
  if (uuid) params.set("uuid", uuid[1]);
  return `https://drive.usercontent.google.com/download?${params.toString()}`;
}

async function download(clip, index) {
  const dest = path.join(OUT, clip.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    console.log(`  ✓ ${clip.file} — already there`);
    return true;
  }
  const url = `https://drive.google.com/uc?export=download&id=${clip.driveId}`;
  let res = await fetch(url, { headers: { "user-agent": DESKTOP_UA }, redirect: "follow" });
  const type = res.headers.get("content-type") ?? "";

  if (type.includes("text/html")) {
    const html = await res.text();
    if (/accounts\.google\.com|ServiceLogin/.test(html) && !/confirm=/i.test(html)) {
      console.error(`  ✗ ${clip.file} — the file is not shared publicly (sign-in wall)`);
      return false;
    }
    res = await fetch(confirmUrl(html, clip.driveId), {
      headers: { "user-agent": DESKTOP_UA, cookie: res.headers.get("set-cookie") ?? "" },
      redirect: "follow",
    });
  }

  if (!res.ok) {
    console.error(`  ✗ ${clip.file} — HTTP ${res.status}`);
    return false;
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    console.error(`  ✗ ${clip.file} — empty response (${buf.length} bytes)`);
    return false;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(dest, buf);
  const mb = (buf.length / 1048576).toFixed(1);
  console.log(`  + ${String(index + 1).padStart(2, "0")} ${clip.file} — ${mb} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ""}`);
  return true;
}

const args = process.argv.slice(2);
const clips = readClips();

if (args.includes("--list")) {
  clips.forEach((c, i) => console.log(`${String(i + 1).padStart(2, "0")}  ${c.file.padEnd(26)} ${c.title}  (${c.driveId})`));
  process.exit(0);
}

const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? Number(args[onlyArg + 1]) : 0;
const queue = only ? [clips[only - 1]] : clips;

console.log(`Google Drive → ${path.relative(ROOT, OUT)}  (${queue.length} clip${queue.length === 1 ? "" : "s"})`);
let ok = 0;
for (let i = 0; i < queue.length; i++) {
  const clip = queue[i];
  if (!clip) continue;
  try {
    if (await download(clip, only ? only - 1 : i)) ok++;
  } catch (e) {
    console.error(`  ✗ ${clip.file} — ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n${ok}/${queue.length} ready. Run \`npm run dev\` and the crystals pick them up on reload.`);
process.exit(ok === queue.length ? 0 : 1);
