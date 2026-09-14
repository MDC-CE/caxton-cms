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

export async function render(
  url: string,
  initialDataPayload: InitialDataPayload | null,
): Promise<string> {
  const ssrQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  seedQueryClient(ssrQueryClient, initialDataPayload);

  const cleanUrl = url.split("?")[0].split("#")[0];

  const restore = suppressLayoutEffectWarnings();

  try {
    // Preload lazy route page + section chunks before streaming so Suspense
    // fallback={null} does not produce an empty #root.
    await Promise.all([
      preloadPublicPageChunks(cleanUrl, initialDataPayload),
      preloadSectionsFromInitialData(initialDataPayload),
    ]);

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
        <Router ssrPath={cleanUrl}>
          <App ssrQueryClient={ssrQueryClient} />
        </Router>,
        {
          onAllReady() {
            pipe(passthrough);
          },
          onError(error: unknown) {
            reject(error);
          },
        },
      );
    });

    return html;
  } finally {
    restore();
  }
}
