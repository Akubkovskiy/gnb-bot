/**
 * Flow types for /new_gnb conversation state machine.
 *
 * 9 steps + resume_prompt pseudo-step:
 * 1. customer → 2. object → 3. gnb_number → 4. based_on_previous →
 * 5. dates → 6. organizations → 7. signatories → 8. pipe_and_gnb_params →
 * 9. review_confirm
 *
 * Draft persistence via DraftStore (survives restarts).
 * Finalization → Transition → renderers (via handler).
 */

import type { Transition, Draft } from "../domain/types.js";
import type { DraftStore } from "../store/drafts.js";
import type { TransitionStore } from "../store/transitions.js";
import type { CustomerStore } from "../store/customers.js";
import type { PeopleStore } from "../store/people.js";

// === Flow steps ===

export type FlowStep =
  | "customer"
  | "object"
  | "gnb_number"
  | "based_on_previous"
  | "dates"
  | "organizations"
  | "signatories"
  | "pipe_and_gnb_params"
  | "review_confirm"
  | "resume_prompt"; // pseudo-step: asks resume/discard for existing draft

/** Ordered step list for sequential navigation. */
export const FLOW_STEPS: FlowStep[] = [
  "customer",
  "object",
  "gnb_number",
  "based_on_previous",
  "dates",
  "organizations",
  "signatories",
  "pipe_and_gnb_params",
  "review_confirm",
];

/** Step number for DraftStore (1-indexed for display). */
export function stepIndex(step: FlowStep): number {
  const idx = FLOW_STEPS.indexOf(step);
  return idx === -1 ? 0 : idx + 1;
}

export function stepFromIndex(index: number): FlowStep {
  if (index < 1 || index > FLOW_STEPS.length) return "customer";
  return FLOW_STEPS[index - 1];
}

// === Flow response ===

export interface FlowResponse {
  message: string;
  done?: boolean;
  /** Set when finalization succeeds — handler uses this to trigger rendering. */
  transition?: Transition;
}

// === Stores bundle ===

export interface FlowStores {
  drafts: DraftStore;
  transitions: TransitionStore;
  customers: CustomerStore;
  people: PeopleStore;
}

// === Draft-to-Transition handoff ===

/**
 * Result of finalizing a draft into a transition.
 * Transition saved to TransitionStore; handler triggers rendering.
 */
export interface FinalizeResult {
  transition: Transition;
  warnings: string[];
}
