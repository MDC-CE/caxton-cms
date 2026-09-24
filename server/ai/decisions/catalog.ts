/**
 * Product decision ids + thresholds. Policy lives here; HTTP client stays dumb.
 */

import type { DecisionClient, DecideResult } from "./types";

export const DECISION_ID_TOUCHES_OUTCOME_FIGURES = "proposal.touches_outcome_figures";

/** Noul above this → treat as yes (figures checklist on). */
export const TOUCHES_OUTCOME_FIGURES_NOUL_THRESHOLD = 0.55;

export type TouchesOutcomeFiguresOutcome = "yes" | "no" | "unavailable";

export async function askTouchesOutcomeFigures(
  client: DecisionClient,
  text: string,
): Promise<{ outcome: TouchesOutcomeFiguresOutcome; raw?: DecideResult }> {
  const truncated = text.length > 12_000 ? `${text.slice(0, 12_000)}\n…` : text;
  const raw = await client.decide({
    timeoutMs: 2000,
    state: {
      decision_id: DECISION_ID_TOUCHES_OUTCOME_FIGURES,
      proposed_text: truncated,
    },
    questions: {
      touches_outcome_figures: {
        type: "noul",
        instructions:
          "Does this proposed text add or change hire rates, salaries, tuition, prices, or similar outcome figures that a reviewer must verify against an approved source?",
        true: "Adds or changes verifiable outcome figures (hire rate, salary, tuition, price, scholarship amount, placement rate).",
        false:
          "No outcome-figure claims — ordinary copy, educational examples, or unrelated percentages.",
      },
    },
  });

  if (raw.status === "unavailable") {
    return { outcome: "unavailable", raw };
  }

  const ans = raw.answers.touches_outcome_figures as { noul?: number } | undefined;
  const noul = typeof ans?.noul === "number" ? ans.noul : 0;
  return {
    outcome: noul >= TOUCHES_OUTCOME_FIGURES_NOUL_THRESHOLD ? "yes" : "no",
    raw,
  };
}
