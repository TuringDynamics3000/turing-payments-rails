/**
 * RTGS Payment Aggregate
 * 
 * Event-sourced aggregate for RTGS payments.
 * State is derived from events, never stored directly.
 * 
 * Key Functions:
 * - createRTGSPayment: Create payment from initial event
 * - applyRTGSEvent: Apply event to payment (pure function)
 * - rebuildRTGSFromEvents: Rebuild payment from event stream
 */

import { RTGSPaymentState, RTGSApprovalRole, getApprovalThreshold } from "./RTGSPaymentState";
import { RTGSPaymentEvent, EVENT_TO_STATE_MAP } from "./RTGSPaymentEvent";
import {
  assertRTGSTransitionLegal,
  assertTerminalStateImmutable,
  assertFundsConservation,
  assertSingleSettlement,
  assertEventOrdering,
  ApprovalRecord,
} from "./RTGSInvariants";

/**
 * RTGS Payment Aggregate
 */
export interface RTGSPayment {
  readonly paymentIntentId: string;
  readonly state: RTGSPaymentState;
  readonly amount: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly bsb: string;
  readonly accountNumber: string;
  
  // Approval workflow
  readonly initiatorId: string;
  readonly initiatorRole: RTGSApprovalRole;
  readonly approvals: ApprovalRecord[];
  readonly requiredApprovers: number;
  readonly requiredRoles: RTGSApprovalRole[];
  readonly approvalExpiresAt?: Date;
  
  // Economic tracking
  readonly fundsEarmarked: bigint;
  readonly fundsDebited: bigint;
  readonly fundsReleased: bigint;
  
  // Lifecycle timestamps
  readonly createdAt: Date;
  readonly sentAt?: Date;
  readonly settledAt?: Date;
  readonly failedAt?: Date;
  readonly rejectedAt?: Date;
  
  // Event sourcing
  readonly events: RTGSPaymentEvent[];
  readonly version: number;
}

/**
 * Create RTGS payment from initial event
 */
export function createRTGSPayment(event: RTGSPaymentEvent): RTGSPayment {
  if (event.type !== "PaymentIntentCreated") {
    throw new Error(
      `Cannot create RTGS payment from event type ${event.type}. Must start with PaymentIntentCreated.`
    );
  }
  
  // Get approval threshold for amount
  const threshold = getApprovalThreshold(event.amount);
  if (!threshold) {
    throw new Error(
      `No approval threshold found for amount ${event.amount}`
    );
  }
  
  return {
    paymentIntentId: event.paymentIntentId,
    state: RTGSPaymentState.CREATED,
    amount: event.amount,
    currency: event.currency,
    idempotencyKey: event.idempotencyKey,
    fromAccountId: event.fromAccountId,
    toAccountId: event.toAccountId,
    bsb: event.bsb,
    accountNumber: event.accountNumber,
    
    // Approval workflow
    initiatorId: event.initiatorId,
    initiatorRole: event.initiatorRole,
    approvals: [],
    requiredApprovers: threshold.minApprovers,
    requiredRoles: threshold.requiredRoles,
    approvalExpiresAt: undefined,
    
    // Economic tracking
    fundsEarmarked: 0n,
    fundsDebited: 0n,
    fundsReleased: 0n,
    
    // Lifecycle timestamps
    createdAt: event.occurredAt,
    sentAt: undefined,
    settledAt: undefined,
    failedAt: undefined,
    rejectedAt: undefined,
    
    // Event sourcing
    events: [event],
    version: 1,
  };
}

/**
 * Apply event to payment (pure function)
 */
export function applyRTGSEvent(
  payment: RTGSPayment,
  event: RTGSPaymentEvent
): RTGSPayment {
  // Validate event ordering
  const lastEvent = payment.events[payment.events.length - 1];
  if (lastEvent) {
    assertEventOrdering(lastEvent.occurredAt, event.occurredAt);
  }
  
  // Get target state from event
  const targetState = EVENT_TO_STATE_MAP[event.type];
  
  // Validate state transition
  assertTerminalStateImmutable(payment.state);
  assertRTGSTransitionLegal(payment.state, targetState);
  
  // Apply event-specific logic
  let updatedPayment = { ...payment };
  
  switch (event.type) {
    case "PaymentIntentCreated":
      // Already handled in createRTGSPayment
      break;
      
    case "ApprovalRequested":
      updatedPayment = {
        ...updatedPayment,
        requiredApprovers: event.requiredApprovers,
        requiredRoles: event.requiredRoles,
        approvalExpiresAt: event.expiresAt,
      };
      break;
      
    case "ApprovalGranted":
      updatedPayment = {
        ...updatedPayment,
        approvals: [
          ...updatedPayment.approvals,
          {
            approverId: event.approverId,
            approverRole: event.approverRole,
            approvedAt: event.occurredAt,
          },
        ],
      };
      break;
      
    case "DualControlVerified":
      // All approvals received, ready to send
      break;
      
    case "ApprovalRejected":
      updatedPayment = {
        ...updatedPayment,
        rejectedAt: event.occurredAt,
      };
      break;
      
    case "PaymentAuthorised":
      updatedPayment = {
        ...updatedPayment,
        fundsEarmarked: event.fundsEarmarked,
      };
      break;
      
    case "PaymentSent":
      updatedPayment = {
        ...updatedPayment,
        fundsDebited: event.fundsDebited,
        sentAt: event.sentAt,
      };
      break;
      
    case "PaymentSettled":
      updatedPayment = {
        ...updatedPayment,
        settledAt: event.settledAt,
      };
      
      // Validate single settlement
      assertSingleSettlement(targetState, event.settledAt);
      break;
      
    case "PaymentFailed":
      updatedPayment = {
        ...updatedPayment,
        fundsReleased: event.fundsReleased,
        failedAt: event.occurredAt,
      };
      break;
  }
  
  // Update state and version
  updatedPayment = {
    ...updatedPayment,
    state: targetState,
    events: [...updatedPayment.events, event],
    version: updatedPayment.version + 1,
  };
  
  // Validate economic invariants (only for terminal states)
  if (
    targetState === RTGSPaymentState.SETTLED ||
    targetState === RTGSPaymentState.FAILED
  ) {
    assertFundsConservation(
      updatedPayment.fundsEarmarked,
      updatedPayment.fundsDebited,
      updatedPayment.fundsReleased
    );
  }
  
  return updatedPayment;
}

/**
 * Rebuild payment from event stream (replay)
 */
export function rebuildRTGSFromEvents(
  events: RTGSPaymentEvent[]
): RTGSPayment {
  if (events.length === 0) {
    throw new Error("Cannot rebuild RTGS payment from empty event stream");
  }
  
  const firstEvent = events[0];
  if (firstEvent.type !== "PaymentIntentCreated") {
    throw new Error(
      `First event must be PaymentIntentCreated, got ${firstEvent.type}`
    );
  }
  
  // Create initial payment
  let payment = createRTGSPayment(firstEvent);
  
  // Apply remaining events
  for (let i = 1; i < events.length; i++) {
    payment = applyRTGSEvent(payment, events[i]);
  }
  
  return payment;
}

/**
 * Get payment state hash (for replay verification)
 */
export function getRTGSPaymentHash(payment: RTGSPayment): string {
  const stateString = JSON.stringify({
    paymentIntentId: payment.paymentIntentId,
    state: payment.state,
    amount: payment.amount.toString(),
    fundsEarmarked: payment.fundsEarmarked.toString(),
    fundsDebited: payment.fundsDebited.toString(),
    fundsReleased: payment.fundsReleased.toString(),
    approvals: payment.approvals,
    version: payment.version,
  });
  
  // Simple hash (in production, use crypto.subtle.digest)
  return Buffer.from(stateString).toString("base64");
}
