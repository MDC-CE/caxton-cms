/** Typed decision questions for Jev / DecisionClient (not chat completions). */

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  true?: string;
  false?: string;
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** option id → description */
  [optionId: string]: string | undefined;
};

export type DecisionQuestion = NoulQuestion | ChoiceQuestion;

export type NoulAnswer = {
  noul: number;
  confidence?: number;
};

export type ChoiceAnswer = {
  choice: string;
  confidence?: number;
};

export type DecisionAnswers = Record<string, NoulAnswer | ChoiceAnswer | unknown>;

export type DecideRequest = {
  model?: string;
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, DecisionQuestion>;
  /** Timeout ms (default client-side). */
  timeoutMs?: number;
};

export type DecideSuccess = {
  status: "ok";
  answers: DecisionAnswers;
  model: string;
};

export type DecideUnavailable = {
  status: "unavailable";
  reason: "no_key" | "timeout" | "error";
  message?: string;
};

export type DecideResult = DecideSuccess | DecideUnavailable;

export interface DecisionClient {
  decide(req: DecideRequest): Promise<DecideResult>;
}
