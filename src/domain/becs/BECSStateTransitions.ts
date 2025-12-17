/**
 * BECS State Transitions - Legal Transition Matrix
 * 
 * This module defines the ONLY legal state transitions for BECS payments.
 * Any transition not listed here is illegal by definition.
 * 
 * Key BECS Differences from NPP:
 * - REMOVE: ACKNOWLEDGED (no scheme ACK in BECS)
 * - ADD: BATCHED, SUBMITTED, CLEARED, RETURNED
 * 
 * BECS Lifecycle:
 * CREATED → AUTHORISED → BATCHED → SUBMITTED → CLEARED → SETTLED
 * 
 * Failure / Exception Paths:
 * BATCHED → FAILED (file build error)
 * SUBMITTED → FAILED (file rejected)
 * CLEARED → RETURNED (dishonour days later)
 * ANY → EXPIRED
 * 
 * Critical difference:
 * BECS failures can arrive days after apparent success.
 */

import { BECSPaymentState } from "./BECSPaymentState";

/**
 * Legal BECS State Transitions
 * 
 * Key: Current state
 * Value: Array of allowed next states
 */
export const BECS_ALLOWED_TRANSITIONS: Record<BECSPaymentState, BECSPaymentState[]> = {
  [BECSPaymentState.CREATED]: [
    BECSPaymentState.AUTHORISED,
    BECSPaymentState.FAILED,
    BECSPaymentState.EXPIRED,
  ],

  [BECSPaymentState.AUTHORISED]: [
    BECSPaymentState.BATCHED,
    BECSPaymentState.FAILED,
    BECSPaymentState.EXPIRED,
  ],

  [BECSPaymentState.BATCHED]: [
    BECSPaymentState.SUBMITTED,
    BECSPaymentState.FAILED,
    BECSPaymentState.EXPIRED,
  ],

  [BECSPaymentState.SUBMITTED]: [
    BECSPaymentState.CLEARED,
    BECSPaymentState.FAILED,
    BECSPaymentState.EXPIRED,
  ],

  [BECSPaymentState.CLEARED]: [
    BECSPaymentState.SETTLED,
    BECSPaymentState.RETURNED,
  ],

  /**
   * SETTLED is technically terminal, but BECS allows
   * SETTLED → RETURNED within the return window (T+3 to T+7 days)
   * 
   * This is commented out to enforce strict terminal state,
   * but the invariant layer allows late returns via compensating events
   */
  [BECSPaymentState.SETTLED]: [],

  // Terminal states - no transitions allowed
  [BECSPaymentState.RETURNED]: [],
  [BECSPaymentState.FAILED]: [],
  [BECSPaymentState.EXPIRED]: [],
};

/**
 * Check if a state transition is legal
 */
export function isBECSTransitionLegal(
  from: BECSPaymentState,
  to: BECSPaymentState
): boolean {
  const allowedTransitions = BECS_ALLOWED_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Get all legal next states for a given state
 */
export function getBECSLegalNextStates(state: BECSPaymentState): BECSPaymentState[] {
  return BECS_ALLOWED_TRANSITIONS[state];
}

/**
 * State Transition Diff Table (NPP vs BECS)
 * 
 * | From        | To         | NPP | BECS |
 * |-------------|------------|-----|------|
 * | CREATED     | AUTHORISED | ✅  | ✅   |
 * | AUTHORISED  | SENT       | ✅  | ❌   |
 * | AUTHORISED  | BATCHED    | ❌  | ✅   |
 * | BATCHED     | SUBMITTED  | ❌  | ✅   |
 * | SUBMITTED   | CLEARED    | ❌  | ✅   |
 * | CLEARED     | SETTLED    | ❌  | ✅   |
 * | CLEARED     | RETURNED   | ❌  | ✅   |
 * | ANY         | FAILED     | ✅  | ✅   |
 * | ANY         | EXPIRED    | ✅  | ✅   |
 */

/**
 * Economic Truth DIFF
 * 
 * | Concept             | NPP          | BECS     |
 * |---------------------|--------------|----------|
 * | Hold timing         | Before SEND  | Before BATCH |
 * | Provisional success | ACKNOWLEDGED | CLEARED  |
 * | Finality            | SETTLED      | SETTLED  |
 * | Late failure        | Rare         | Expected |
 * 
 * New BECS rule:
 * Funds may appear settled and still be returned.
 */
