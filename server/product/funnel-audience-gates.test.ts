import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../funnel-enforcement", () => ({
  isFunnelEnforcedForType: vi.fn(),
  siteHasPurchasableProducts: vi.fn(),
}));

vi.mock("./product-manager", () => ({
  productManager: {
    findProductByProgramId: vi.fn(),
    findProductByCmsEntry: vi.fn(),
  },
}));

import { isFunnelEnforcedForType, siteHasPurchasableProducts } from "../funnel-enforcement";
import { productManager } from "./product-manager";
import { assertFunnelAudienceGates } from "./funnel-audience-gates";

describe("assertFunnelAudienceGates + enforcement", () => {
  beforeEach(() => {
    vi.mocked(isFunnelEnforcedForType).mockReset();
    vi.mocked(siteHasPurchasableProducts).mockReset();
    vi.mocked(productManager.findProductByCmsEntry).mockReset();
    vi.mocked(productManager.findProductByProgramId).mockReset();
  });

  it("skips completeness and persona when enforcement off", () => {
    vi.mocked(isFunnelEnforcedForType).mockReturnValue(false);
    const result = assertFunnelAudienceGates(
      { products: [{ product: "ai-flex" }] },
      { contentType: "landing", contentSlug: "x" },
    );
    expect(result.ok).toBe(true);
  });

  it("requires stage when enforced", () => {
    vi.mocked(isFunnelEnforcedForType).mockReturnValue(true);
    vi.mocked(siteHasPurchasableProducts).mockReturnValue(false);
    const result = assertFunnelAudienceGates(
      {},
      { contentType: "landing", contentSlug: "x" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_funnel_stage");
  });

  it("requires products when site has purchasables", () => {
    vi.mocked(isFunnelEnforcedForType).mockReturnValue(true);
    vi.mocked(siteHasPurchasableProducts).mockReturnValue(true);
    const result = assertFunnelAudienceGates(
      { stage: "awareness" },
      { contentType: "landing", contentSlug: "x" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_funnel_products");
  });

  it("accepts products all with stage", () => {
    vi.mocked(isFunnelEnforcedForType).mockReturnValue(true);
    vi.mocked(siteHasPurchasableProducts).mockReturnValue(true);
    const result = assertFunnelAudienceGates(
      { stage: "decision", products: "all" },
      { contentType: "landing", contentSlug: "x" },
    );
    expect(result.ok).toBe(true);
  });

  it("program self may omit persona when enforced", () => {
    vi.mocked(isFunnelEnforcedForType).mockReturnValue(true);
    vi.mocked(siteHasPurchasableProducts).mockReturnValue(true);
    vi.mocked(productManager.findProductByCmsEntry).mockReturnValue({
      content_type: "program",
      audience: {
        offer: { one_liner: "x", who_its_for: "y" },
        personas: [
          {
            id: "career-changer",
            role: "Switcher",
            avatar: {
              fears: ["a"],
              internal_dialogue: "b",
              objections: ["c"],
            },
          },
        ],
      },
    } as never);
    const result = assertFunnelAudienceGates(
      { stage: "decision", products: [{ product: "full-stack" }] },
      { contentType: "program", contentSlug: "full-stack" },
    );
    expect(result.ok).toBe(true);
  });
});
