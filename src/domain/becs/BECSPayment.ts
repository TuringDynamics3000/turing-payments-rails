/**
 * BECS Payment - Immutable Aggregate Root
 * 
 * This module implements the BECS payment aggregate following event sourcing principles.
 * All state is derived from events, never stored directly.
 * 
 * Key BECS Realities:
 * - Batch processing (not real-time)
 * - Delayed settlement (T+1 to T+3 days)
 * - Late returns expected (dishonour days after clearing)
 * - File-level failures (entire batch can be rejected)
 * 
 * Usage:
 * ```typescript
 * const payment = createBECSPayment(intentEvent);
 * const updated = applyEvent(payment, authorisedEvent);
 * const rebuilt = rebuildFromEvents(events);
 * ```
 */

import { BECSPaymentState } from "./BECSPaymentState";
import { BECSPaymentEvent } from "./BECSPaymentEvent";
import {
  assertBECSTransitionLegal,
  assertNotBECSTerminal,
  validateAllBECSInvariants,
} from "./BECSInvariants";

/**
 * BECS Payment Aggregate
 * 
 * Immutable data structure representing a BECS payment's current state
 */
export interface BECSPayment {
  readonly paymentIntentId: string;
  readonly state: BECSPaymentState;
  readonly amount: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly bsb?: string;
  readonly accountNumber?: string;
  readonly batchId?: string;
  readonly batchDate?: string;
  readonly fileReference?: string;
  readonly returnCode?: string;
  readonly returnReason?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Create a new BECS payment from a PaymentIntentCreated event
 */
export function createBECSPayment(event: BECSPaymentEvent): BECSPayment {
  if (event.type !== "PaymentIntentCreated") {
    throw new Error("Payment must be created from PaymentIntentCreated event");
  }

  return {
    paymentIntentId: event.paymentIntentId,
    state: BECSPaymentState.CREATED,
    amount: event.amount,
    currency: event.currency,
    idempotencyKey: event.idempotencyKey,
    fromAccountId: event.fromAccountId,
    toAccountId: event.toAccountId,
    bsb: event.bsb,
    accountNumber: event.accountNumber,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
}

/**
 * Apply an event to a BECS payment, returning a new immutable payment
 */
export function applyBECSEvent(
  payment: BECSPayment,
  event: BECSPaymentEvent
): BECSPayment {
  // Determine next state based on event type
  const nextState = deriveNextBECSState(payment.state, event);

  // Validate state transition
  if (nextState !== payment.state) {
    assertNotBECSTerminal(payment.state);
    assertBECSTransitionLegal(payment.state, nextState);
  }

  // Apply event-specific updates
  const updates = applyBECSEventUpdates(payment, event);

  // Return new immutable payment
  return {
    ...payment,
    ...updates,
    state: nextState,
    updatedAt: event.occurredAt,
  };
}

/**
 * Derive next state from event type
 */
function deriveNextBECSState(
  currentState: BECSPaymentState,
  event: BECSPaymentEvent
): BECSPaymentState {
  switch (event.type) {
    case "PaymentIntentCreated":
      return BECSPaymentState.CREATED;
    
    case "PaymentAuthorised":
      return BECSPaymentState.AUTHORISED;
    
    case "PaymentBatched":
      return BECSPaymentState.BATCHED;
    
    case "BatchSubmitted":
      return BECSPaymentState.SUBMITTED;
    
    case "PaymentCleared":
      return BECSPaymentState.CLEARED;
    
    case "PaymentSettled":
      return BECSPaymentState.SETTLED;
    
    case "PaymentReturned":
      return BECSPaymentState.RETURNED;
    
    case "PaymentFailed":
      return BECSPaymentState.FAILED;
    
    case "PaymentExpired":
      return BECSPaymentState.EXPIRED;
    
    case "OpsOverrideApplied":
      // Ops override doesn't change state directly
      return currentState;
    
    default:
      return currentState;
  }
}

/**
 * Apply event-specific updates to payment
 */
function applyBECSEventUpdates(
  payment: BECSPayment,
  event: BECSPaymentEvent
): Partial<BECSPayment> {
  switch (event.type) {
    case "PaymentBatched":
      return {
        batchId: event.batchId,
        batchDate: event.batchDate,
      };
    
    case "BatchSubmitted":
      return {
        fileReference: event.fileReference,
      };
    
    case "PaymentReturned":
      return {
        returnCode: event.returnCode,
        returnReason: event.returnReason,
      };
    
    default:
      return {};
  }
}

/**
 * Rebuild a BECS payment from a sequence of events
 * 
 * This is the core replay mechanism that proves determinism:
 * Same events in same order → same final state
 */
export function rebuildBECSFromEvents(events: BECSPaymentEvent[]): BECSPayment {
  if (events.length === 0) {
    throw new Error("Cannot rebuild payment from empty event list");
  }

  const firstEvent = events[0];
  if (firstEvent.type !== "PaymentIntentCreated") {
    throw new Error("First event must be PaymentIntentCreated");
  }

  // Create initial payment
  let payment = createBECSPayment(firstEvent);

  // Apply remaining events
  for (let i = 1; i < events.length; i++) {
    payment = applyBECSEvent(payment, events[i]);
  }

  // Validate all invariants hold
  validateAllBECSInvariants(events, payment.state);

  return payment;
}

/**
 * Compute a deterministic hash of payment state
 * 
 * Used to verify replay produces identical results
 */
export function computeBECSStateHash(payment: BECSPayment): string {
  const crypto = require("crypto");
  
  const stateString = JSON.stringify({
    paymentIntentId: payment.paymentIntentId,
    state: payment.state,
    amount: payment.amount.toString(),
    currency: payment.currency,
    idempotencyKey: payment.idempotencyKey,
    fromAccountId: payment.fromAccountId,
    toAccountId: payment.toAccountId,
    bsb: payment.bsb,
    accountNumber: payment.accountNumber,
    batchId: payment.batchId,
    batchDate: payment.batchDate,
    fileReference: payment.fileReference,
    returnCode: payment.returnCode,
    returnReason: payment.returnReason,
  });

  return crypto.createHash("sha256").update(stateString).digest("hex");
}

/**
 * Check if a BECS payment is in a terminal state
 */
export function isBECSPaymentTerminal(payment: BECSPayment): boolean {
  return (
    payment.state === BECSPaymentState.SETTLED ||
    payment.state === BECSPaymentState.RETURNED ||
    payment.state === BECSPaymentState.FAILED ||
    payment.state === BECSPaymentState.EXPIRED
  );
}

/**
 * Check if a BECS payment can be retried
 * 
 * Only FAILED payments can be retried
 */
export function canRetryBECSPayment(payment: BECSPayment): boolean {
  return payment.state === BECSPaymentState.FAILED;
}

/**
 * Check if a BECS payment can be cancelled
 * 
 * Only AUTHORISED or BATCHED payments can be cancelled
 */
export function canCancelBECSPayment(payment: BECSPayment): boolean {
  return (
    payment.state === BECSPaymentState.AUTHORISED ||
    payment.state === BECSPaymentState.BATCHED
  );
}

/**
 * Check if a BECS payment can be resubmitted
 * 
 * Only SUBMITTED payments that failed can be resubmitted
 */
export function canResubmitBECSPayment(payment: BECSPayment): boolean {
  return payment.state === BECSPaymentState.SUBMITTED;
}

/**
 * Check if a BECS payment can be returned
 * 
 * Only CLEARED payments can be returned
 */
export function canReturnBECSPayment(payment: BECSPayment): boolean {
  return payment.state === BECSPaymentState.CLEARED;
}
