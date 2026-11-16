// Rough GLSL sanity checker for src/intro/shaders.ts
// - extracts `export const NAME = /* glsl */ \`...\`;`
// - applies a minimal #ifdef/#ifndef/#if defined/#elif/#else/#endif preprocessor for a set of defines
// - parses with @shaderfrog/glsl-parser
const fs = require("fs");
const path = require("path");
const { parse } = require("@shaderfrog/glsl-parser");

const file = process.argv[2] || "src/intro/shaders.ts";
const src = fs.readFileSync(file, "utf8");

// Grab all exported glsl template literals
const re = /export const (\w+)\s*=\s*\/\* glsl \*\/\s*`([\s\S]*?)`;/g;
const shaders = {};
let m;
while ((m = re.exec(src))) shaders[m[1]] = m[2];

function preprocess(code, defines) {
  const lines = code.split("\n");
  const out = [];
  const stack = [];
  let active = true;
  const evalCond = (expr) => {
    expr = expr.trim();
    // handle "defined(X)" and "defined X"
    let e = expr.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, n) => (defines.has(n) ? "1" : "0"));
    e = e.replace(/defined\s+(\w+)/g, (_, n) => (defines.has(n) ? "1" : "0"));
    if (!/^[\s\d!&|()]+$/.test(e)) return true; // unknown -> keep
    try {
      // eslint-disable-next-line no-new-func
      return !!Function(`return (${e});`)();
    } catch {
      return true;
    }
  };
  for (const line of lines) {
    const t = line.trim();
    let mm;
    if ((mm = /^#ifdef\s+(\w+)/.exec(t))) {
      const v = defines.has(mm[1]);
      stack.push({ parent: active, v });
      active = active && v;
      continue;
    }
    if ((mm = /^#ifndef\s+(\w+)/.exec(t))) {
      const v = !defines.has(mm[1]);
      stack.push({ parent: active, v });
      active = active && v;
      continue;
    }
    if ((mm = /^#if\s+(.+)/.exec(t))) {
      const v = evalCond(mm[1]);
      stack.push({ parent: active, v });
      active = active && v;
      continue;
    }
    if ((mm = /^#elif\s+(.+)/.exec(t))) {
      const top = stack[stack.length - 1];
      if (top) {
        const v = !top.v && evalCond(mm[1]);
        top.v = top.v || v;
        active = top.parent && v;
      }
      continue;
    }
    if (/^#else/.test(t)) {
      const top = stack[stack.length - 1];
      if (top) {
        active = top.parent && !top.v;
        top.v = true;
      }
      continue;
    }
    if (/^#endif/.test(t)) {
      const top = stack.pop();
      if (top) active = top.parent;
      continue;
    }
    if (/^#(extension|version|pragma)/.test(t)) continue;
    if (/^#/.test(t)) continue; // drop other directives (defines on uniforms etc. handled by caller)
    out.push(active ? line : "");
  }
  return out.join("\n");
}

const VARIANTS = [
  { name: "base", defines: new Set() },
  { name: "TERRAIN", defines: new Set(["TERRAIN"]) },
  { name: "PILLAR", defines: new Set(["PILLAR"]) },
  { name: "MONO", defines: new Set(["MONO"]) },
  { name: "TERRAIN+MONO", defines: new Set(["TERRAIN", "MONO"]) },
];

// simplify `#define X` / `#define X value` lines by keeping them for the parser? drop them
function stripDefines(code) {
  return code
    .split("\n")
    .filter((l) => !/^\s*#define/.test(l))
    .join("\n");
}

// resolve ${chunk} interpolations
function resolve(code, depth = 0) {
  if (depth > 5) return code;
  return code.replace(/\$\{(\w+)\}/g, (_, n) => (shaders[n] !== undefined ? resolve(shaders[n], depth + 1) : "/*missing:" + n + "*/"));
}
for (const k of Object.keys(shaders)) shaders[k] = resolve(shaders[k]);

let fail = 0;
for (const [name, code] of Object.entries(shaders)) {
  for (const v of VARIANTS) {
    const pre = stripDefines(preprocess(code, v.defines));
    const warnings = [];
    const orig = console.log;
    const origErr = console.error;
    const origWarn = console.warn;
    console.log = (...a) => warnings.push(a.join(" "));
    console.error = (...a) => warnings.push(a.join(" "));
    console.warn = (...a) => warnings.push(a.join(" "));
    try {
      parse(pre, { stage: /Vert$/.test(name) ? "vertex" : "fragment" });
      const builtins = /^(position|normal|uv|uv1|uv2|uv3|color|tangent|skinIndex|skinWeight|instanceMatrix|modelMatrix|modelViewMatrix|projectionMatrix|viewMatrix|normalMatrix|cameraPosition|isOrthographic|gl_Position|gl_PointSize|gl_FragColor|gl_FragCoord|gl_PointCoord|gl_FrontFacing|gl_InstanceID|gl_VertexID|texture2D|textureCube|texture)$/;
      const undef = [...new Set(warnings.filter((w) => w.includes("undefined variable")).map((w) => (w.match(/"([^"]+)"/) || [])[1]).filter((n) => n && !builtins.test(n)))];
      if (undef.length) {
        console.log(`\n? ${name} [${v.name}] undefined: ${undef.join(", ")}`);
      }
      warnings.length = 0;
    } catch (e) {
      // Only complain for variants that actually change the code (avoid noise on unrelated ones)
      const changed = preprocess(code, v.defines) !== preprocess(code, new Set());
      if (v.name === "base" || changed) {
        fail++;
        console.log(`\n✗ ${name} [${v.name}] ${e.message}`);
        const ln = e.line || 0;
        const lines = pre.split("\n");
        for (let i = Math.max(0, ln - 3); i < Math.min(lines.length, ln + 2); i++) {
          console.log(String(i + 1).padStart(4), lines[i]);
        }
      }
    } finally {
      console.log = orig;
      console.error = origErr;
      console.warn = origWarn;
    }
  }
}
console.log(fail === 0 ? `\n✓ all ${Object.keys(shaders).length} shaders parse` : `\n${fail} parse failures`);
console.log("Found shaders:", Object.keys(shaders).join(", "));
process.exit(fail ? 1 : 0);
