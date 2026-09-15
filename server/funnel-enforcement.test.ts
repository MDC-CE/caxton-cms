import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({
  getFunnelSettings: vi.fn(),
}));

vi.mock("./content-types", () => ({
  getType: vi.fn((t: string) => t),
  getContentTypeConfig: vi.fn(),
}));

vi.mock("./product/product-manager", () => ({
  productManager: {
    listAllProducts: vi.fn(() => []),
  },
}));

import { getFunnelSettings } from "./settings";
import { getContentTypeConfig } from "./content-types";
import {
  isSiteFunnelEnforcementEnabled,
  isContentTypeFunnelMonitoringEnabled,
  isFunnelEnforcedForType,
} from "./funnel-enforcement";

describe("funnel-enforcement helpers", () => {
  beforeEach(() => {
    vi.mocked(getFunnelSettings).mockReset();
    vi.mocked(getContentTypeConfig).mockReset();
  });

  it("site off → not enforced even when type omitted", () => {
    vi.mocked(getFunnelSettings).mockReturnValue({ enforcement: false });
    vi.mocked(getContentTypeConfig).mockReturnValue({ directory: "blog" } as never);
    expect(isSiteFunnelEnforcementEnabled()).toBe(false);
    expect(isFunnelEnforcedForType("blog")).toBe(false);
  });

  it("site on + type omitted → enforced", () => {
    vi.mocked(getFunnelSettings).mockReturnValue({ enforcement: true });
    vi.mocked(getContentTypeConfig).mockReturnValue({ directory: "blog" } as never);
    expect(isContentTypeFunnelMonitoringEnabled("blog")).toBe(true);
    expect(isFunnelEnforcedForType("blog")).toBe(true);
  });

  it("site on + type funnel.enforcement false → not enforced", () => {
    vi.mocked(getFunnelSettings).mockReturnValue({ enforcement: true });
    vi.mocked(getContentTypeConfig).mockReturnValue({
      directory: "authors",
      funnel: { enforcement: false },
    } as never);
    expect(isContentTypeFunnelMonitoringEnabled("authors")).toBe(false);
    expect(isFunnelEnforcedForType("authors")).toBe(false);
  });
});
