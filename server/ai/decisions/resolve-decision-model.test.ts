import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  DEFAULT_DECISION_MODEL,
  isAllowedDecisionModel,
  resolveDecisionModel,
} from "../LLMService";

describe("resolveDecisionModel", () => {
  const prevEnv = process.env.LLM_DECISION_MODEL;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.LLM_DECISION_MODEL;
    else process.env.LLM_DECISION_MODEL = prevEnv;
  });

  it("allowlist accepts known ids", () => {
    expect(isAllowedDecisionModel("~typesafe/jev-latest")).toBe(true);
    expect(isAllowedDecisionModel("typesafe/jev-1.13")).toBe(true);
    expect(isAllowedDecisionModel("openai/gpt-4o")).toBe(false);
  });

  it("defaults to jev-latest when llm.yml has no decision", () => {
    delete process.env.LLM_DECISION_MODEL;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-decision-"));
    fs.writeFileSync(
      path.join(dir, "llm.yml"),
      "model:\n  default: openai/gpt-4o-mini\n",
      "utf-8",
    );
    expect(resolveDecisionModel(dir)).toBe(DEFAULT_DECISION_MODEL);
  });

  it("reads model.decision when allowed", () => {
    delete process.env.LLM_DECISION_MODEL;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-decision-"));
    fs.writeFileSync(
      path.join(dir, "llm.yml"),
      "model:\n  default: openai/gpt-4o-mini\n  decision: typesafe/jev-1.13\n",
      "utf-8",
    );
    expect(resolveDecisionModel(dir)).toBe("typesafe/jev-1.13");
  });

  it("ignores invalid model.decision and falls back", () => {
    delete process.env.LLM_DECISION_MODEL;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-decision-"));
    fs.writeFileSync(
      path.join(dir, "llm.yml"),
      "model:\n  decision: openai/gpt-4o\n",
      "utf-8",
    );
    expect(resolveDecisionModel(dir)).toBe(DEFAULT_DECISION_MODEL);
  });

  it("env LLM_DECISION_MODEL wins when allowed", () => {
    process.env.LLM_DECISION_MODEL = "typesafe/jev-1.13";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-decision-"));
    fs.writeFileSync(
      path.join(dir, "llm.yml"),
      "model:\n  decision: ~typesafe/jev-latest\n",
      "utf-8",
    );
    expect(resolveDecisionModel(dir)).toBe("typesafe/jev-1.13");
  });
});
