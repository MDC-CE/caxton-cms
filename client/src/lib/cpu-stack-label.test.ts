import { describe, expect, it } from "vitest";
import { cpuThreadCoverage, formatCpuStackRaw, labelCpuSymbol } from "./cpu-stack-label";

const node = "/home/alejandro/.nvm/versions/node/v24.18.0/bin/node";

describe("cpu stack labels", () => {
  it("shows the JavaScript name and the source path, without the perf map", () => {
    expect(labelCpuSymbol(
      "JS:*burnFromOurRoute file:///home/alejandro/wsl-projects/website/website-v3/server/dev-cpu-burn-route.ts:1:197",
      "/tmp/perf-1773.map",
      "js",
    )).toEqual({
      name: "burnFromOurRoute",
      path: "server/dev-cpu-burn-route.ts:1:197",
    });
  });

  it("drops the quote V8 puts before a JavaScript name", () => {
    expect(labelCpuSymbol(
      "JS:*'stallInOurFunction file:///home/alejandro/wsl-projects/website/website-v3/server/dev-cpu-burn-worker.ts:1:142",
      "/tmp/perf-1773.map",
      "js",
    ).name).toBe("stallInOurFunction");
  });

  it("keeps Builtins_ and drops C++ argument types", () => {
    expect(labelCpuSymbol("Builtins_InterpreterEntryTrampoline", node, "native")).toEqual({
      name: "Builtins_InterpreterEntryTrampoline",
      path: node,
    });
    expect(labelCpuSymbol(
      "v8::internal::(anonymous namespace)::Invoke(v8::internal::Isolate*, v8::internal::(anonymous namespace)::InvokeParams const&)",
      node,
      "native",
    ).name).toBe("v8::internal::Invoke");
    expect(labelCpuSymbol(
      "v8::internal::Execution::TryCall(v8::internal::Isolate*, v8::internal::DirectHandle<v8::internal::Object>, v8::internal::Execution::MessageHandling, v8::internal::MaybeDirectHandle<v8::internal::Object>*)",
      node,
      "native",
    ).name).toBe("v8::internal::Execution::TryCall");
    expect(labelCpuSymbol(
      "v8::internal::Handle<v8::internal::HeapNumber> v8::internal::FactoryBase<v8::internal::Factory>::NewHeapNumber<(v8::internal::AllocationType)0>()",
      node,
      "native",
    ).name).toBe("v8::internal::FactoryBase<v8::internal::Factory>::NewHeapNumber");
  });

  it("keeps a native clock name and drops the empty argument list", () => {
    expect(labelCpuSymbol("v8::base::OS::TimeCurrentMillis()", node, "native").name)
      .toBe("v8::base::OS::TimeCurrentMillis");
    expect(labelCpuSymbol("__vdso_gettimeofday", "[vdso]", "native")).toEqual({
      name: "__vdso_gettimeofday",
      path: null,
    });
  });

  it("copies the stored symbols, not the short names", () => {
    const text = formatCpuStackRaw({
      ok: true,
      threads: [{
        name: "WorkerThread 2849",
        percent: 40.1,
        frames: [{
          percent: 0,
          function: "JS:*burnFromOurRoute file:///home/alejandro/wsl-projects/website/website-v3/server/dev-cpu-burn-route.ts:1:197",
          file: "/tmp/perf-1773.map",
          kind: "js",
          callers: [{ function: "Builtins_InterpreterEntryTrampoline", file: node }],
        }],
      }],
    });
    expect(text).toContain("JS:*burnFromOurRoute file:///home/alejandro/wsl-projects/website/website-v3/server/dev-cpu-burn-route.ts:1:197 /tmp/perf-1773.map");
    expect(text).toContain(`called by Builtins_InterpreterEntryTrampoline ${node}`);
  });
});

describe("cpu thread coverage", () => {
  it("reports the stored functions as a share of the thread", () => {
    expect(cpuThreadCoverage(97.7, [6.8, 6.6, 6.3, 3.3, 2.6, 2.5])).toBe(28.8);
  });

  it("stays blank when the thread has no samples", () => {
    expect(cpuThreadCoverage(0, [1])).toBeNull();
  });
});
