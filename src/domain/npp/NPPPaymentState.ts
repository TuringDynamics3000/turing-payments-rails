/**
 * NPP Payment State - Canonical State Definitions
 * 
 * This enum defines the ONLY legal states for NPP payments.
 * Anything not listed here is illegal by definition.
 * 
 * State transition rules are enforced in NPPInvariants.ts
 */

export enum NPPPaymentState {
  /**
   * CREATED - Intent exists, nothing executed
   * Economic Impact: None
   */
  CREATED = "CREATED",

  /**
   * AUTHORISED - Policy & balance checks passed
   * Economic Impact: Funds earmarked
   */
  AUTHORISED = "AUTHORISED",

  /**
   * SENT - Submitted to NPP rail
   * Economic Impact: Funds held
   */
  SENT = "SENT",

  /**
   * ACKNOWLEDGED - Accepted by scheme
   * Economic Impact: Funds still provisional
   * 
   * KEY NPP REALITY: ACK ≠ settlement
   * The system must tolerate failure after ACK.
   */
  ACKNOWLEDGED = "ACKNOWLEDGED",

  /**
   * SETTLED - Final settlement confirmed
   * Economic Impact: Funds moved
   * 
   * TERMINAL STATE - No transitions allowed from here
   */
  SETTLED = "SETTLED",

  /**
   * FAILED - Terminal failure
   * Economic Impact: Funds released
   * 
   * TERMINAL STATE - No transitions allowed from here
   */
  FAILED = "FAILED",

  /**
   * EXPIRED - Time window elapsed
   * Economic Impact: Funds released
   * 
   * TERMINAL STATE - No transitions allowed from here
   */
  EXPIRED = "EXPIRED",
}

/**
 * Terminal states - no transitions allowed from these states
 */
export const TERMINAL_STATES: Set<NPPPaymentState> = new Set([
  NPPPaymentState.SETTLED,
  NPPPaymentState.FAILED,
  NPPPaymentState.EXPIRED,
]);

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: NPPPaymentState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Failure reasons for FAILED state
 */
export enum NPPFailureReason {
  POLICY = "POLICY",           // Policy checks failed
  SUBMISSION = "SUBMISSION",   // Failed to submit to rail
  RAIL = "RAIL",              // Rail rejected/timeout
  POST_ACK = "POST_ACK",      // Late failure after ACK
}
