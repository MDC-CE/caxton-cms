import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askTouchesOutcomeFigures,
  TOUCHES_OUTCOME_FIGURES_NOUL_THRESHOLD,
  type DecisionClient,
} from "./index";
import { probeDecisionModel } from "./openrouter-jev";

describe("askTouchesOutcomeFigures", () => {
  it("returns yes above threshold", async () => {
    const client: DecisionClient = {
      async decide() {
        return {
          status: "ok",
          model: "test",
          answers: {
            touches_outcome_figures: { noul: TOUCHES_OUTCOME_FIGURES_NOUL_THRESHOLD },
          },
        };
      },
    };
    const r = await askTouchesOutcomeFigures(client, "salary $80k");
    expect(r.outcome).toBe("yes");
  });

  it("returns no below threshold", async () => {
    const client: DecisionClient = {
      async decide() {
        return {
          status: "ok",
          model: "test",
          answers: { touches_outcome_figures: { noul: 0.1 } },
        };
      },
    };
    const r = await askTouchesOutcomeFigures(client, "50% of chapter");
    expect(r.outcome).toBe("no");
  });

  it("returns unavailable on client failure", async () => {
    const client: DecisionClient = {
      async decide() {
        return { status: "unavailable", reason: "no_key" };
      },
    };
    const r = await askTouchesOutcomeFigures(client, "x");
    expect(r.outcome).toBe("unavailable");
  });

  it("omits model so client uses resolveDecisionModel default", async () => {
    const client: DecisionClient = {
      async decide(req) {
        expect(req.model).toBeUndefined();
        return {
          status: "ok",
          model: "~typesafe/jev-latest",
          answers: { touches_outcome_figures: { noul: 0.9 } },
        };
      },
    };
    const r = await askTouchesOutcomeFigures(client, "hire rate 90%");
    expect(r.outcome).toBe("yes");
  });
});

describe("probeDecisionModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when decisions API answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          answers: { reachable: { noul: 0.9 } },
          model: "typesafe/jev-1.13",
        }),
      })),
    );
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";
    try {
      const r = await probeDecisionModel({ model: "typesafe/jev-1.13" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.model).toContain("jev");
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});
