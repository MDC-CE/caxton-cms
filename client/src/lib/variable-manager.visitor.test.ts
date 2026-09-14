import { describe, expect, it } from "vitest";
import { resolveTemplateString } from "./variable-manager";

describe("resolveTemplateString visitor bag", () => {
  const defs = {};
  const ctx = {};

  it("resolves visitor.id and visitor.first_name from a profile-shaped bag", () => {
    const visitor = {
      valid: true,
      id: 42,
      email: "ana@example.com",
      first_name: "Ana",
      last_name: "García",
      phone: "+123",
    };
    const { text } = resolveTemplateString(
      "id={{ visitor.id }} name={{ visitor.first_name }}",
      defs,
      ctx,
      { visitor },
    );
    expect(text).toBe("id=42 name=Ana");
  });

  it("uses pipe fallback when visitor field is missing", () => {
    const { text } = resolveTemplateString(
      "{{ visitor.missing | none }}",
      defs,
      ctx,
      { visitor: { id: 1 } },
    );
    expect(text).toBe("none");
  });

  it("leaves token when visitor bag is absent and no fallback", () => {
    const { text } = resolveTemplateString("{{ visitor.id }}", defs, ctx);
    expect(text).toBe("{{ visitor.id }}");
  });
});
