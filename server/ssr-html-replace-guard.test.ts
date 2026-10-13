import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Guard: page-HTML assembly must never pass dynamic text as a `.replace()` replacement
 * string — `$1`, `$&`, `` $` ``, `$'`, `$$` in CMS copy get expanded and corrupt the page.
 * Allowed second arguments: a plain string literal, a template literal without `${`,
 * or an inline function (whose return value is inserted literally).
 */
const GUARDED_FILES = [
  "vite.ts",
  "render-hub-html.ts",
  "initial-data-middleware.ts",
  "ssr-schema.ts",
  "gtm-web-inject.ts",
  "redirects.ts",
  "utils/ssr-html.ts",
  "utils/html-inject.ts",
];

function skipQuoted(src: string, i: number): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === quote) return j + 1;
    j++;
  }
  return src.length;
}

function skipBalancedExpr(src: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '"' || ch === "'") {
      j = skipQuoted(src, j);
      continue;
    }
    if (ch === "`") {
      j = skipTemplate(src, j);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (depth === 0) return j + 1;
      depth--;
    }
    j++;
  }
  return src.length;
}

function skipTemplate(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === "`") return j + 1;
    if (src[j] === "$" && src[j + 1] === "{") {
      j = skipBalancedExpr(src, j + 2);
      continue;
    }
    j++;
  }
  return src.length;
}

function skipRegex(src: string, i: number): number {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      j++;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      return j;
    }
    j++;
  }
  return src.length;
}

/** Raw top-level argument strings of a call whose `(` ends just before `start`. */
function readCallArgs(src: string, start: number): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let argStart = start;
  let prev = "(";
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(src, i);
      prev = ch;
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(src, i);
      prev = "`";
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close < 0 ? src.length : close + 2;
      continue;
    }
    if (ch === "/" && /[(,=:[!&|?{};]/.test(prev)) {
      i = skipRegex(src, i);
      prev = "/";
      continue;
    }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) {
        args.push(src.slice(argStart, i));
        return args;
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(src.slice(argStart, i));
      argStart = i + 1;
    }
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return null;
}

function isSafeReplacement(rawArg: string): boolean {
  const arg = rawArg.trim();
  if (!arg) return true;
  if ((arg[0] === '"' || arg[0] === "'") && skipQuoted(arg, 0) === arg.length) return true;
  if (arg[0] === "`" && skipTemplate(arg, 0) === arg.length && !arg.includes("${")) return true;
  if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*(:\s*[^=]+)?=>/s.test(arg)) return true;
  if (/^(async\s+)?function\b/.test(arg)) return true;
  return false;
}

type Violation = { line: number; replacement: string };

function findUnsafeReplaceCalls(src: string): Violation[] {
  const violations: Violation[] = [];
  const callRe = /\.replace(?:All)?\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    const args = readCallArgs(src, m.index + m[0].length);
    if (!args || args.length < 2) continue;
    if (!isSafeReplacement(args[1])) {
      violations.push({
        line: src.slice(0, m.index).split("\n").length,
        replacement: args[1].trim().replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }
  return violations;
}

describe("SSR HTML replace guard", () => {
  it("detects unsafe replacement arguments (scanner self-check)", () => {
    const bad = [
      "html.replace(re, `$1${escaped}$2`);",
      'html.replace("</body>", scriptTag + "</body>");',
      "html.replace('<div id=\"root\"></div>', `<div id=\"root\">${appHtml}</div>`);",
      "out.replace(new RegExp(`\\\\$${i + 1}`, \"g\"), value);",
    ].join("\n");
    expect(findUnsafeReplaceCalls(bad).map((v) => v.line)).toEqual([1, 2, 3, 4]);

    const good = [
      'html.replace(/a/g, "&amp;");',
      "html.replace(re, (_m, open: string, close: string) => open + escaped + close);",
      "html.replace(marker, () => fragment + marker);",
      "s.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");",
      "url.replace(/x/, `literal`);",
      "html.replace(re, function (m) { return m; });",
    ].join("\n");
    expect(findUnsafeReplaceCalls(good)).toEqual([]);
  });

  for (const rel of GUARDED_FILES) {
    it(`${rel} passes no dynamic replacement strings to .replace()`, () => {
      const file = path.resolve(import.meta.dirname, rel);
      const src = fs.readFileSync(file, "utf-8");
      const violations = findUnsafeReplaceCalls(src);
      const message = violations
        .map(
          (v) =>
            `server/${rel}:${v.line} — replacement \`${v.replacement}\` is a string built from data. ` +
            "Use a function replacer (`(m, ...groups) => ...`) or insertBefore/replaceLiteral from server/utils/html-inject.ts.",
        )
        .join("\n");
      expect(violations, message).toEqual([]);
    });
  }
});
