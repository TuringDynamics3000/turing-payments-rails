/**
 * RTGS State Transition Matrix
 * 
 * Defines legal state transitions for RTGS payments.
 * RTGS is governance-first: no SEND without APPROVED.
 * 
 * Key Differences from NPP:
 * - AUTHORISED → PENDING_APPROVAL (not SENT)
 * - PENDING_APPROVAL → APPROVED | REJECTED
 * - APPROVED → QUEUED (optional queueing)
 * - QUEUED → SENT
 * 
 * Terminal States: SETTLED, REJECTED, FAILED, EXPIRED
 */

import { RTGSPaymentState } from "./RTGSPaymentState";

/**
 * RTGS Allowed State Transitions
 * 
 * Maps each state to its legal next states.
 * Enforces governance-first flow: approval before sending.
 */
export const RTGS_ALLOWED_TRANSITIONS: Record<
  RTGSPaymentState,
  RTGSPaymentState[]
> = {
  /**
   * CREATED → PENDING_APPROVAL, FAILED, REJECTED
   * 
   * Payment intent created, goes straight to approval workflow
   */
  [RTGSPaymentState.CREATED]: [
    RTGSPaymentState.PENDING_APPROVAL,
    RTGSPaymentState.FAILED,
    RTGSPaymentState.REJECTED,
  ],
  
  /**
   * PENDING_APPROVAL → PENDING_APPROVAL, APPROVED, REJECTED
   * 
   * Awaiting dual-control approval
   * Can stay in PENDING_APPROVAL for incremental approvals
   */
  [RTGSPaymentState.PENDING_APPROVAL]: [
    RTGSPaymentState.PENDING_APPROVAL, // Allow incremental approvals
    RTGSPaymentState.APPROVED,
    RTGSPaymentState.REJECTED,
  ],
  
  /**
   * APPROVED → SENT, FAILED
   * 
   * All approvals granted, ready to send
   */
  [RTGSPaymentState.APPROVED]: [
    RTGSPaymentState.SENT,
    RTGSPaymentState.FAILED,
  ],
  
  /**
   * REJECTED → (terminal)
   * 
   * Approval denied, payment cannot proceed
   */
  [RTGSPaymentState.REJECTED]: [],
  
  /**
   * SENT → SETTLED, FAILED
   * 
   * Payment sent to RTGS rail, awaiting settlement
   */
  [RTGSPaymentState.SENT]: [
    RTGSPaymentState.SETTLED,
    RTGSPaymentState.FAILED,
  ],
  
  /**
   * SETTLED → (terminal)
   * 
   * Payment settled on RTGS rail, funds transferred
   */
  [RTGSPaymentState.SETTLED]: [],
  
  /**
   * FAILED → (terminal)
   * 
   * Payment failed at any stage
   */
  [RTGSPaymentState.FAILED]: [],
};

/**
 * Check if state transition is legal
 */
export function isRTGSTransitionLegal(
  from: RTGSPaymentState,
  to: RTGSPaymentState
): boolean {
  const allowedNextStates = RTGS_ALLOWED_TRANSITIONS[from];
  return allowedNextStates.includes(to);
}

/**
 * Get allowed next states for current state
 */
export function getAllowedNextStates(
  currentState: RTGSPaymentState
): RTGSPaymentState[] {
  return RTGS_ALLOWED_TRANSITIONS[currentState] || [];
}

/**
 * Check if state is terminal
 */
export function isTerminalState(state: RTGSPaymentState): boolean {
  return RTGS_ALLOWED_TRANSITIONS[state].length === 0;
}
