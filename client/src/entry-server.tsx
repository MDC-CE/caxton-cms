import { renderToPipeableStream } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { Router } from "wouter";
import { PassThrough } from "node:stream";
import App from "./App";
import { preloadSectionsFromInitialData } from "./components/sectionRegistry";
import { preloadPublicPageChunks } from "./lib/preloadPublicPageChunk";

interface SingleQuery {
  queryKey: unknown[];
  data: unknown;
}

type InitialDataPayload =
  | { queries: SingleQuery[]; queryKey?: never; data?: never }
  | { queryKey: unknown[]; data: unknown; queries?: never };

function ssrDiagEnabled(): boolean {
  return process.env.SSR_DIAG === "1" || process.env.NODE_ENV !== "production";
}

function ssrDiag(fields: Record<string, unknown>, message: string): void {
  if (!ssrDiagEnabled()) return;
  // entry-server runs in Vite SSR / Node — console goes to the same terminal as Express.
  console.info(`[SSR-diag] ${message}`, fields);
}

function suppressLayoutEffectWarnings(): () => void {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("useLayoutEffect does nothing on the server")
    ) {
      return;
    }
    original.apply(console, args);
  };
  return () => {
    console.error = original;
  };
}

function installSsrLocation(url: string): () => void {
  const g = globalThis as typeof globalThis & { location?: unknown };
  const previous = Object.getOwnPropertyDescriptor(g, "location");
  const hashIdx = url.indexOf("#");
  const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = withoutHash.indexOf("?");
  const pathname = (qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash) || "/";
  const search = qIdx >= 0 ? withoutHash.slice(qIdx) : "";
  const href = `https://ssr.local${pathname}${search}`;

  const shim = {
    pathname,
    search,
    hash: hashIdx >= 0 ? url.slice(hashIdx) : "",
    href,
    origin: "https://ssr.local",
    host: "ssr.local",
    hostname: "ssr.local",
    port: "",
    protocol: "https:",
    assign() {},
    replace() {},
    reload() {},
  };

  Object.defineProperty(g, "location", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: shim,
  });

  return () => {
    if (previous) {
      Object.defineProperty(g, "location", previous);
    } else {
      Reflect.deleteProperty(g, "location");
    }
  };
}

function seedQueryClient(
  client: QueryClient,
  payload: InitialDataPayload | null,
): void {
  if (!payload) return;

  if (payload.queries && Array.isArray(payload.queries)) {
    for (const { queryKey, data } of payload.queries) {
      client.setQueryData(
        queryKey as Parameters<typeof client.setQueryData>[0],
        data,
      );
    }
  } else if (payload.queryKey && payload.data !== undefined) {
    client.setQueryData(
      payload.queryKey as Parameters<typeof client.setQueryData>[0],
      payload.data,
    );
  }
}

function summarizePayload(payload: InitialDataPayload | null): Record<string, unknown> {
  if (!payload) return { hasPayload: false };
  if (payload.queries && Array.isArray(payload.queries)) {
    return {
      hasPayload: true,
      queryCount: payload.queries.length,
      queryKeys: payload.queries.map((q) =>
        Array.isArray(q.queryKey) ? q.queryKey.slice(0, 3) : q.queryKey,
      ),
    };
  }
  return {
    hasPayload: true,
    queryKey: Array.isArray(payload.queryKey)
      ? payload.queryKey.slice(0, 3)
      : payload.queryKey,
  };
}

export async function render(
  url: string,
  initialDataPayload: InitialDataPayload | null,
): Promise<string> {
  const restoreLocation = installSsrLocation(url);
  const ssrQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  seedQueryClient(ssrQueryClient, initialDataPayload);

  const hashIdx = url.indexOf("#");
  const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = withoutHash.indexOf("?");
  const ssrPath = (qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash) || "/";
  // Non-empty string so wouter's `props.ssrSearch || parent` does not drop it
  // (empty string is falsy and falls through to undefined).
  const ssrSearch = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "";
  const cleanUrl = ssrPath;
  const t0 = Date.now();

  const restore = suppressLayoutEffectWarnings();

  try {
    // Preload lazy route page + section chunks before streaming so Suspense
    // fallback={null} does not produce an empty #root.
    ssrDiag(
      { url: cleanUrl, ...summarizePayload(initialDataPayload) },
      "preload starting",
    );

    try {
      await Promise.all([
        preloadPublicPageChunks(cleanUrl, initialDataPayload),
        preloadSectionsFromInitialData(initialDataPayload),
      ]);
      ssrDiag({ url: cleanUrl, ms: Date.now() - t0 }, "preload ok");
    } catch (preloadErr) {
      ssrDiag(
        {
          url: cleanUrl,
          ms: Date.now() - t0,
          errMessage:
            preloadErr instanceof Error ? preloadErr.message : String(preloadErr),
          stack:
            preloadErr instanceof Error
              ? preloadErr.stack?.split("\n").slice(0, 8)
              : undefined,
        },
        "preload FAILED (will rethrow — Suspense may blank #root)",
      );
      throw preloadErr;
    }

    const html = await new Promise<string>((resolve, reject) => {
      let chunks = "";
      const passthrough = new PassThrough();
      passthrough.setEncoding("utf-8");
      passthrough.on("data", (chunk: string) => {
        chunks += chunk;
      });
      passthrough.on("end", () => resolve(chunks));
      passthrough.on("error", reject);

      const { pipe } = renderToPipeableStream(
        // location shim above covers wouter's bare `location.search` snapshot.
        // ssrPath/ssrSearch keep usePathname/useSearch server snapshots aligned.
        <Router ssrPath={ssrPath} ssrSearch={ssrSearch}>
          <App ssrQueryClient={ssrQueryClient} />
        </Router>,
        {
          onAllReady() {
            pipe(passthrough);
          },
          onError(error: unknown) {
            ssrDiag(
              {
                url: cleanUrl,
                errMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8) : undefined,
              },
              "renderToPipeableStream onError",
            );
            reject(error);
          },
        },
      );
    });

    const trimmed = html.replace(/<!--[\s\S]*?-->/g, "").trim();
    const hasTag = /<[a-zA-Z]/.test(trimmed);
    ssrDiag(
      {
        url: cleanUrl,
        htmlLength: html.length,
        trimmedLength: trimmed.length,
        hasTag,
        ms: Date.now() - t0,
        preview: trimmed.slice(0, 160),
      },
      !hasTag ? "render finished EMPTY" : "render finished OK",
    );

    return html;
  } finally {
    restore();
    restoreLocation();
  }
}
