/**
 * RTGS Payment Invariants
 * 
 * Governance-first invariants for RTGS payments.
 * These are non-negotiable rules enforced at runtime.
 * 
 * Categories:
 * 1. Approval Invariants (dual-control, separation of duties)
 * 2. State Transition Invariants
 * 3. Economic Invariants (funds conservation)
 * 4. Temporal Invariants (approval expiry)
 */

import { RTGSPaymentState, RTGSApprovalRole } from "./RTGSPaymentState";
import { isRTGSTransitionLegal } from "./RTGSStateTransitions";

/**
 * Approval Record
 */
export interface ApprovalRecord {
  readonly approverId: string;
  readonly approverRole: RTGSApprovalRole;
  readonly approvedAt: Date;
}

/**
 * Category 1: Approval Invariants
 */

/**
 * Invariant: No SEND without APPROVED
 * 
 * RTGS payments cannot be sent without all required approvals.
 */
export function assertApprovalBeforeSend(
  state: RTGSPaymentState,
  approvals: ApprovalRecord[]
): void {
  if (state === RTGSPaymentState.SENT && approvals.length === 0) {
    throw new Error(
      "INVARIANT_VIOLATION: Cannot send RTGS payment without approvals"
    );
  }
}

/**
 * Invariant: Dual-Control Verification
 * 
 * High-value payments require at least 2 independent approvers.
 */
export function assertDualControl(
  approvals: ApprovalRecord[],
  requiredApprovers: number
): void {
  if (approvals.length < requiredApprovers) {
    throw new Error(
      `INVARIANT_VIOLATION: Dual-control requires ${requiredApprovers} approvers, got ${approvals.length}`
    );
  }
  
  // All approvers must be unique
  const uniqueApprovers = new Set(approvals.map((a) => a.approverId));
  if (uniqueApprovers.size !== approvals.length) {
    throw new Error(
      "INVARIANT_VIOLATION: All approvers must be unique (no duplicate approvals)"
    );
  }
}

/**
 * Invariant: Separation of Duties
 * 
 * Initiator cannot approve their own payment.
 */
export function assertSeparationOfDuties(
  initiatorId: string,
  approvals: ApprovalRecord[]
): void {
  const initiatorApproved = approvals.some((a) => a.approverId === initiatorId);
  if (initiatorApproved) {
    throw new Error(
      "INVARIANT_VIOLATION: Initiator cannot approve their own payment (separation of duties)"
    );
  }
}

/**
 * Invariant: Required Roles Present
 * 
 * All required approval roles must be present.
 */
export function assertRequiredRoles(
  approvals: ApprovalRecord[],
  requiredRoles: RTGSApprovalRole[]
): void {
  const approvalRoles = new Set(approvals.map((a) => a.approverRole));
  
  for (const requiredRole of requiredRoles) {
    if (!approvalRoles.has(requiredRole)) {
      throw new Error(
        `INVARIANT_VIOLATION: Missing required approval role: ${requiredRole}`
      );
    }
  }
}

/**
 * Category 2: State Transition Invariants
 */

/**
 * Invariant: Legal State Transitions
 * 
 * Only legal state transitions are allowed.
 */
export function assertRTGSTransitionLegal(
  from: RTGSPaymentState,
  to: RTGSPaymentState
): void {
  if (!isRTGSTransitionLegal(from, to)) {
    throw new Error(
      `INVARIANT_VIOLATION: Illegal RTGS state transition from ${from} to ${to}`
    );
  }
}

/**
 * Invariant: Terminal State Immutability
 * 
 * Terminal states cannot transition to any other state.
 */
export function assertTerminalStateImmutable(state: RTGSPaymentState): void {
  const terminalStates = [
    RTGSPaymentState.SETTLED,
    RTGSPaymentState.REJECTED,
    RTGSPaymentState.FAILED,
  ];
  
  if (terminalStates.includes(state)) {
    throw new Error(
      `INVARIANT_VIOLATION: Cannot transition from terminal state ${state}`
    );
  }
}

/**
 * Category 3: Economic Invariants
 */

/**
 * Invariant: Funds Conservation
 * 
 * Funds earmarked must equal funds debited/released.
 */
export function assertFundsConservation(
  fundsEarmarked: bigint,
  fundsDebited: bigint,
  fundsReleased: bigint
): void {
  const totalAccounted = fundsDebited + fundsReleased;
  
  if (fundsEarmarked !== totalAccounted) {
    throw new Error(
      `INVARIANT_VIOLATION: Funds conservation violated. Earmarked: ${fundsEarmarked}, Debited: ${fundsDebited}, Released: ${fundsReleased}`
    );
  }
}

/**
 * Invariant: Single Settlement
 * 
 * Payment can only be settled once.
 */
export function assertSingleSettlement(
  state: RTGSPaymentState,
  settledAt?: Date
): void {
  if (state === RTGSPaymentState.SETTLED && !settledAt) {
    throw new Error(
      "INVARIANT_VIOLATION: SETTLED state requires settledAt timestamp"
    );
  }
  
  if (state !== RTGSPaymentState.SETTLED && settledAt) {
    throw new Error(
      `INVARIANT_VIOLATION: Cannot have settledAt timestamp in state ${state}`
    );
  }
}

/**
 * Category 4: Temporal Invariants
 */

/**
 * Invariant: Approval Not Expired
 * 
 * Approvals must not be expired when sending payment.
 */
export function assertApprovalNotExpired(
  approvalExpiresAt: Date,
  now: Date = new Date()
): void {
  if (now > approvalExpiresAt) {
    throw new Error(
      `INVARIANT_VIOLATION: Approval expired at ${approvalExpiresAt.toISOString()}`
    );
  }
}

/**
 * Invariant: Event Ordering
 * 
 * Events must be ordered chronologically.
 */
export function assertEventOrdering(
  previousEventTime: Date,
  currentEventTime: Date
): void {
  if (currentEventTime < previousEventTime) {
    throw new Error(
      `INVARIANT_VIOLATION: Event ordering violated. Current event (${currentEventTime.toISOString()}) is before previous event (${previousEventTime.toISOString()})`
    );
  }
}

/**
 * Composite Invariant: All Approval Requirements Met
 * 
 * Checks all approval-related invariants at once.
 */
export function assertAllApprovalRequirementsMet(
  initiatorId: string,
  approvals: ApprovalRecord[],
  requiredApprovers: number,
  requiredRoles: RTGSApprovalRole[],
  approvalExpiresAt: Date
): void {
  assertDualControl(approvals, requiredApprovers);
  assertSeparationOfDuties(initiatorId, approvals);
  assertRequiredRoles(approvals, requiredRoles);
  assertApprovalNotExpired(approvalExpiresAt);
}
