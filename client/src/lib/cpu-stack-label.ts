/**
 * Short names for the CPU stack list. The stored symbol stays complete;
 * Copy full stack uses that text.
 */

export type CpuStackSymbolKind = "js" | "native" | "kernel";

export type CpuStackLabel = {
  name: string;
  /** Source file or binary. The perf name map is not a source path. */
  path: string | null;
};

const JS_SYMBOL = /^JS:[*+^~]?'?\s*(.*?)\s+(\S+:\d+:\d+)$/;

export function labelCpuSymbol(symbol: string, file: string, kind: CpuStackSymbolKind): CpuStackLabel {
  const js = symbol.match(JS_SYMBOL);
  if (js || kind === "js") {
    const name = js?.[1]?.trim() || shortenNative(symbol);
    const fromSymbol = js?.[2] ? displayPath(js[2]) : null;
    return { name: name || symbol, path: fromSymbol || sourcePath(file) };
  }
  return { name: shortenNative(symbol), path: sourcePath(file) };
}

function sourcePath(file: string): string | null {
  if (!file || file === "[unknown]" || file.startsWith("[") || file.endsWith(".map")) return null;
  return displayPath(file);
}

function displayPath(raw: string): string {
  let path = raw.replace(/^file:\/\//, "");
  const marker = "/website-v3/";
  const at = path.indexOf(marker);
  if (at >= 0) path = path.slice(at + marker.length);
  return path;
}

function shortenNative(symbol: string): string {
  let name = symbol.replace(/\(anonymous namespace\)::/g, "");
  name = stripTrailing(name, "(", ")");
  name = stripTrailing(name, "<", ">");
  const cut = lastTopLevelSpace(name);
  if (cut >= 0) name = name.slice(cut + 1).trim();
  return name || symbol;
}

function stripTrailing(input: string, open: string, close: string): string {
  if (!input.endsWith(close)) return input;
  let depth = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    if (input[i] === close) depth++;
    else if (input[i] === open) {
      depth--;
      if (depth === 0) return input.slice(0, i).trim();
    }
  }
  return input;
}

function lastTopLevelSpace(input: string): number {
  let angle = 0;
  let paren = 0;
  let last = -1;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === " " && angle === 0 && paren === 0) last = i;
  }
  return last;
}

type StackFrame = {
  percent: number;
  function: string;
  file: string;
  kind: CpuStackSymbolKind;
  callers?: Array<{ function: string; file: string }>;
  caller?: { function: string; file: string };
};

type StackCapture =
  | { ok: true; threads: Array<{ name: string; percent: number; frames: StackFrame[] }> }
  | { ok: false; error: string };

/** The unshortened stack, for pasting into an agent chat. */
export function formatCpuStackRaw(stack: StackCapture): string {
  if (!stack.ok) return stack.error;
  return stack.threads.map((thread) => {
    const lines = [`${thread.name} ${thread.percent}%`];
    for (const frame of thread.frames) {
      lines.push(`${frame.percent}% ${frame.function}${frame.file ? ` ${frame.file}` : ""}`);
      const chain = frame.callers?.length ? frame.callers : frame.caller ? [frame.caller] : [];
      for (const step of chain) {
        lines.push(`called by ${step.function}${step.file ? ` ${step.file}` : ""}`);
      }
    }
    return lines.join("\n");
  }).join("\n");
}
