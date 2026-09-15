import { describe, expect, it } from "vitest";
import {
  resolveLeadFormCopy,
  resolveLeadFormPhase,
} from "../client/src/lib/resolveLeadFormCopy";

describe("resolveLeadFormPhase", () => {
  it("returns guest_signup when not a signup form", () => {
    expect(
      resolveLeadFormPhase({
        isSignup: false,
        loginMode: true,
        isLoggedIn: true,
        allRequiredFieldsFilled: true,
      }),
    ).toBe("guest_signup");
  });

  it("returns login when loginMode is on", () => {
    expect(
      resolveLeadFormPhase({
        isSignup: true,
        loginMode: true,
        isLoggedIn: false,
        allRequiredFieldsFilled: false,
      }),
    ).toBe("login");
  });

  it("returns logged_in_incomplete when required fields are still empty", () => {
    expect(
      resolveLeadFormPhase({
        isSignup: true,
        loginMode: false,
        isLoggedIn: true,
        allRequiredFieldsFilled: false,
      }),
    ).toBe("logged_in_incomplete");
  });

  it("returns logged_in_ready when every required visible field is filled", () => {
    expect(
      resolveLeadFormPhase({
        isSignup: true,
        loginMode: false,
        isLoggedIn: true,
        allRequiredFieldsFilled: true,
      }),
    ).toBe("logged_in_ready");
  });
});

describe("resolveLeadFormCopy", () => {
  it("keeps guest subtitle optional when nothing is set", () => {
    const copy = resolveLeadFormCopy("guest_signup", {}, "en");
    expect(copy.subtitle).toBeUndefined();
    expect(copy.submit_label).toBe("Submit");
  });

  it("uses messages.guest subtitle over top-level subtitle", () => {
    const copy = resolveLeadFormCopy(
      "guest_signup",
      {
        subtitle: "Top subtitle",
        submit_label: "Top submit",
        messages: {
          guest: {
            subtitle: "Nested subtitle",
            submit_label: "Nested submit",
          },
        },
      },
      "en",
    );
    expect(copy.subtitle).toBe("Nested subtitle");
    expect(copy.submit_label).toBe("Nested submit");
  });

  it("uses messages.incomplete overrides", () => {
    const copy = resolveLeadFormCopy(
      "logged_in_incomplete",
      {
        messages: {
          incomplete: {
            subtitle: "Custom missing",
            submit_label: "Go",
          },
        },
      },
      "en",
    );
    expect(copy.subtitle).toBe("Custom missing");
    expect(copy.submit_label).toBe("Go");
  });

  it("hides a subtitle when the subtitle is null", () => {
    const copy = resolveLeadFormCopy(
      "logged_in_ready",
      {
        messages: {
          ready: {
            subtitle: null,
            submit_label: "Start",
          },
        },
      },
      "en",
    );
    expect(copy.subtitle).toBeUndefined();
    expect(copy.submit_label).toBe("Start");
  });

  it("hides a subtitle when the entire stage is null", () => {
    const copy = resolveLeadFormCopy(
      "login",
      { messages: { login: null } },
      "en",
    );
    expect(copy.subtitle).toBeUndefined();
    expect(copy.submit_label).toBe("Log in");
    expect(copy.back_label).toBe("Back to create account");
  });

  it("lets messages.guest null hide a legacy top-level subtitle", () => {
    const copy = resolveLeadFormCopy(
      "guest_signup",
      {
        subtitle: "Legacy subtitle",
        messages: { guest: null },
      },
      "en",
    );
    expect(copy.subtitle).toBeUndefined();
  });

  it("falls back to locale defaults for ready", () => {
    const copy = resolveLeadFormCopy("logged_in_ready", {}, "es");
    expect(copy.subtitle).toContain("Confirma");
    expect(copy.submit_label).toBe("Confirmar");
  });

  it("uses messages.login and back_label", () => {
    const copy = resolveLeadFormCopy(
      "login",
      { messages: { login: { back_label: "Volver" } } },
      "es",
    );
    expect(copy.subtitle).toBe("Usa tu cuenta 4Geeks para continuar");
    expect(copy.back_label).toBe("Volver");
  });

  it("falls back to deprecated top-level login block", () => {
    const copy = resolveLeadFormCopy(
      "login",
      { login: { subtitle: "Legacy login subtitle" } },
      "en",
    );
    expect(copy.subtitle).toBe("Legacy login subtitle");
  });

  it("uses messages.guest title when set", () => {
    const copy = resolveLeadFormCopy(
      "guest_signup",
      {
        messages: {
          guest: {
            title: "Live now!",
            subtitle: "Join the event",
          },
        },
      },
      "en",
    );
    expect(copy.title).toBe("Live now!");
    expect(copy.subtitle).toBe("Join the event");
  });

  it("omits title when messages.guest.title is null", () => {
    const copy = resolveLeadFormCopy(
      "guest_signup",
      {
        messages: {
          guest: {
            title: null,
            subtitle: "Only subtitle",
          },
        },
      },
      "en",
    );
    expect(copy.title).toBeUndefined();
    expect(copy.subtitle).toBe("Only subtitle");
  });

  it("passes through per-phase subtitle_style (option B)", () => {
    const copy = resolveLeadFormCopy(
      "guest_signup",
      {
        messages: {
          guest: {
            subtitle: "Centered",
            subtitle_style: { align: "center", emphasis: "strong" },
          },
        },
      },
      "en",
    );
    expect(copy.subtitle_style).toEqual({ align: "center", emphasis: "strong" });
  });

  it("does not inherit subtitle_style across phases", () => {
    const copy = resolveLeadFormCopy(
      "logged_in_ready",
      {
        messages: {
          guest: {
            subtitle_style: { align: "center", emphasis: "strong" },
          },
          ready: {
            subtitle: "Ready subtitle",
          },
        },
      },
      "en",
    );
    expect(copy.subtitle).toBe("Ready subtitle");
    expect(copy.subtitle_style).toBeUndefined();
  });
});
