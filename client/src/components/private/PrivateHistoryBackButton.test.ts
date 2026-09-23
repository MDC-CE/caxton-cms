import { describe, expect, it, vi } from "vitest";
import { navigatePrivateHistoryBack } from "./PrivateHistoryBackButton";

describe("navigatePrivateHistoryBack", () => {
  it("calls historyBack when history has a prior entry", () => {
    const historyBack = vi.fn();
    const navigate = vi.fn();

    navigatePrivateHistoryBack({
      historyLength: 2,
      historyBack,
      navigate,
      fallbackHref: "/private/diagnostics",
    });

    expect(historyBack).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to fallback when history has no prior entry", () => {
    const historyBack = vi.fn();
    const navigate = vi.fn();

    navigatePrivateHistoryBack({
      historyLength: 1,
      historyBack,
      navigate,
      fallbackHref: "/",
    });

    expect(historyBack).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/");
  });
});
