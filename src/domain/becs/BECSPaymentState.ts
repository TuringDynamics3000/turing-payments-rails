/**
 * BECS Payment State - Canonical State Definitions
 * 
 * BECS (Bulk Electronic Clearing System) is batch + delayed truth.
 * Payments are batched, submitted as files, and cleared days later.
 * 
 * Key BECS Realities:
 * - Batch processing (not real-time like NPP)
 * - Delayed settlement (T+1 to T+3 days)
 * - Late returns expected (dishonour days after apparent success)
 * - File-level failures (entire batch can be rejected)
 * - Item-level returns (individual payments can be returned)
 * 
 * Critical difference from NPP:
 * BECS failures can arrive days after apparent success.
 * Funds may appear settled and still be returned.
 * 
 * State transition rules are enforced in BECSInvariants.ts
 */

export enum BECSPaymentState {
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
   * BATCHED - Added to batch file for submission
   * Economic Impact: Funds held, awaiting batch submission
   * 
   * KEY BECS REALITY: Payments are batched before submission
   */
  BATCHED = "BATCHED",

  /**
   * SUBMITTED - Batch file submitted to BECS rail
   * Economic Impact: Funds held, awaiting clearing
   * 
   * File-level failures can occur here
   */
  SUBMITTED = "SUBMITTED",

  /**
   * CLEARED - Payment cleared by BECS rail
   * Economic Impact: Funds provisionally moved
   * 
   * KEY BECS REALITY: Clearing ≠ settlement
   * Payments can still be returned after clearing
   */
  CLEARED = "CLEARED",

  /**
   * SETTLED - Final settlement confirmed
   * Economic Impact: Funds moved (but return window still open)
   * 
   * TERMINAL STATE - No transitions allowed from here
   * (except RETURNED if within return window)
   */
  SETTLED = "SETTLED",

  /**
   * RETURNED - Payment returned/dishonoured
   * Economic Impact: Funds reversed
   * 
   * KEY BECS REALITY: Returns can arrive days after clearing
   * TERMINAL STATE - No transitions allowed from here
   */
  RETURNED = "RETURNED",

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
 * BECS Failure Reasons
 * 
 * Tracks why BECS payments fail for audit and retry decisions
 */
export enum BECSFailureReason {
  /**
   * RAIL - External BECS rail failure
   * Retry: Safe
   */
  RAIL = "RAIL",

  /**
   * FILE_REJECTED - Batch file rejected by BECS
   * Retry: Safe (after fixing file format)
   */
  FILE_REJECTED = "FILE_REJECTED",

  /**
   * BATCH_BUILD_ERROR - Error building batch file
   * Retry: Safe (after fixing data)
   */
  BATCH_BUILD_ERROR = "BATCH_BUILD_ERROR",

  /**
   * INSUFFICIENT_FUNDS - Balance check failed
   * Retry: Not safe (need funds)
   */
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",

  /**
   * INVALID_ACCOUNT - Account not found or invalid
   * Retry: Not safe (need valid account)
   */
  INVALID_ACCOUNT = "INVALID_ACCOUNT",

  /**
   * DISHONOURED - Payment dishonoured by receiving bank
   * Retry: Not safe (requires investigation)
   */
  DISHONOURED = "DISHONOURED",

  /**
   * CANCELLED - Operator cancelled
   * Retry: Not safe (intentional cancellation)
   */
  CANCELLED = "CANCELLED",

  /**
   * EXPIRED - Time window elapsed
   * Retry: Not safe (need new intent)
   */
  EXPIRED = "EXPIRED",
}

/**
 * BECS Return Codes
 * 
 * Standard BECS return/dishonour codes
 */
export enum BECSReturnCode {
  /**
   * 01 - Refer to Drawer
   */
  REFER_TO_DRAWER = "01",

  /**
   * 02 - Insufficient Funds
   */
  INSUFFICIENT_FUNDS = "02",

  /**
   * 03 - Account Closed
   */
  ACCOUNT_CLOSED = "03",

  /**
   * 04 - Invalid Account Number
   */
  INVALID_ACCOUNT = "04",

  /**
   * 05 - Payment Stopped
   */
  PAYMENT_STOPPED = "05",

  /**
   * 08 - Drawer Deceased
   */
  DRAWER_DECEASED = "08",

  /**
   * 09 - Customer Advises Not Drawn
   */
  NOT_DRAWN = "09",
}

/**
 * Terminal States - No transitions allowed from these states
 * 
 * Note: SETTLED is technically terminal, but BECS allows
 * SETTLED → RETURNED within the return window
 */
export const BECS_TERMINAL_STATES: BECSPaymentState[] = [
  BECSPaymentState.RETURNED,
  BECSPaymentState.FAILED,
  BECSPaymentState.EXPIRED,
];

/**
 * Check if a state is terminal
 */
export function isBECSTerminalState(state: BECSPaymentState): boolean {
  return BECS_TERMINAL_STATES.includes(state);
}
