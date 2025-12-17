/**
 * NPP Payment Events - Immutable Lifecycle Facts
 * 
 * Every state transition MUST emit exactly one event.
 * Events are append-only and never mutated.
 * Current state = fold(events)
 */

import { NPPPaymentState, NPPFailureReason } from "./NPPPaymentState";

/**
 * Base event interface
 */
export interface NPPPaymentEvent {
  type: string;
  occurredAt: Date;
  paymentIntentId: string;
  data?: Record<string, unknown>;
}

/**
 * PaymentIntentCreated - Intent exists, nothing executed
 */
export interface PaymentIntentCreated extends NPPPaymentEvent {
  type: "PaymentIntentCreated";
  amount: bigint;
  currency: "AUD";
  idempotencyKey: string;
  fromAccountId: string;
  toAccountId: string;
}

/**
 * PaymentAuthorised - Policy & balance checks passed
 */
export interface PaymentAuthorised extends NPPPaymentEvent {
  type: "PaymentAuthorised";
  policyChecksPassed: boolean;
  fundsEarmarked: bigint;
}

/**
 * PaymentAttemptCreated - New attempt created (for retries)
 */
export interface PaymentAttemptCreated extends NPPPaymentEvent {
  type: "PaymentAttemptCreated";
  attemptId: string;
  rail: "NPP";
}

/**
 * PaymentSentToRail - Submitted to NPP rail
 */
export interface PaymentSentToRail extends NPPPaymentEvent {
  type: "PaymentSentToRail";
  attemptId: string;
  externalRef?: string;
  fundsHeld: bigint;
}

/**
 * PaymentAcknowledged - Accepted by scheme
 * 
 * KEY NPP REALITY: ACK ≠ settlement
 * Funds are still provisional at this stage
 */
export interface PaymentAcknowledged extends NPPPaymentEvent {
  type: "PaymentAcknowledged";
  attemptId: string;
  schemeRef: string;
  fundsProvisional: bigint;
}

/**
 * PaymentSettled - Final settlement confirmed
 * 
 * TERMINAL EVENT - No further transitions allowed
 */
export interface PaymentSettled extends NPPPaymentEvent {
  type: "PaymentSettled";
  attemptId: string;
  settlementRef: string;
  fundsMoved: bigint;
}

/**
 * PaymentFailed - Terminal failure
 * 
 * TERMINAL EVENT - Funds released
 */
export interface PaymentFailed extends NPPPaymentEvent {
  type: "PaymentFailed";
  reason: NPPFailureReason;
  attemptId?: string;
  fundsReleased: bigint;
  errorMessage?: string;
}

/**
 * PaymentExpired - Time window elapsed
 * 
 * TERMINAL EVENT - Funds released
 */
export interface PaymentExpired extends NPPPaymentEvent {
  type: "PaymentExpired";
  attemptId?: string;
  fundsReleased: bigint;
  expiryReason: string;
}

/**
 * OpsOverrideApplied - Operator override action
 * 
 * All ops actions emit this event for audit trail
 */
export interface OpsOverrideApplied extends NPPPaymentEvent {
  type: "OpsOverrideApplied";
  operatorId: string;
  action: "RETRY" | "CANCEL" | "MARK_FAILED" | "OVERRIDE";
  reason: string;
  fromState: NPPPaymentState;
  toState: NPPPaymentState;
  policyGate: string;
}

/**
 * Union type of all NPP payment events
 */
export type NPPPaymentEventUnion =
  | PaymentIntentCreated
  | PaymentAuthorised
  | PaymentAttemptCreated
  | PaymentSentToRail
  | PaymentAcknowledged
  | PaymentSettled
  | PaymentFailed
  | PaymentExpired
  | OpsOverrideApplied;

/**
 * Map event type to next state
 */
export function mapEventToState(event: NPPPaymentEventUnion): NPPPaymentState {
  switch (event.type) {
    case "PaymentIntentCreated":
      return NPPPaymentState.CREATED;
    case "PaymentAuthorised":
      return NPPPaymentState.AUTHORISED;
    case "PaymentSentToRail":
      return NPPPaymentState.SENT;
    case "PaymentAcknowledged":
      return NPPPaymentState.ACKNOWLEDGED;
    case "PaymentSettled":
      return NPPPaymentState.SETTLED;
    case "PaymentFailed":
      return NPPPaymentState.FAILED;
    case "PaymentExpired":
      return NPPPaymentState.EXPIRED;
    case "PaymentAttemptCreated":
      // Attempt creation doesn't change state
      return NPPPaymentState.CREATED; // Will be overridden by context
    case "OpsOverrideApplied":
      return event.toState;
    default:
      throw new Error(`UNKNOWN_EVENT_TYPE: ${(event as any).type}`);
  }
}
