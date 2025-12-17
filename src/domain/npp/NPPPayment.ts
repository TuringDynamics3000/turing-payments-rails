/**
 * NPP Payment Aggregate - Immutable State Container
 * 
 * State is derived from events via apply(event) method.
 * No setters, no mutations, only event application.
 */

import { NPPPaymentState } from "./NPPPaymentState";
import { NPPPaymentEventUnion, mapEventToState } from "./NPPPaymentEvent";

export interface NPPPayment {
  readonly paymentIntentId: string;
  readonly state: NPPPaymentState;
  readonly amount: bigint;
  readonly currency: "AUD";
  readonly idempotencyKey: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly attempts: string[]; // attemptIds
  readonly currentAttemptId?: string;
  readonly externalRef?: string;
  readonly schemeRef?: string;
  readonly settlementRef?: string;
  readonly createdAt: Date;
  readonly settledAt?: Date;
  readonly failedAt?: Date;
  readonly expiredAt?: Date;
}

/**
 * Create initial NPP payment from PaymentIntentCreated event
 */
export function createNPPPayment(
  event: Extract<NPPPaymentEventUnion, { type: "PaymentIntentCreated" }>
): NPPPayment {
  return {
    paymentIntentId: event.paymentIntentId,
    state: NPPPaymentState.CREATED,
    amount: event.amount,
    currency: event.currency,
    idempotencyKey: event.idempotencyKey,
    fromAccountId: event.fromAccountId,
    toAccountId: event.toAccountId,
    attempts: [],
    createdAt: event.occurredAt,
  };
}

/**
 * Apply event to payment (immutable)
 * Returns new payment with updated state
 */
export function applyEvent(
  payment: NPPPayment,
  event: NPPPaymentEventUnion
): NPPPayment {
  const newState = mapEventToState(event);

  switch (event.type) {
    case "PaymentIntentCreated":
      return createNPPPayment(event);

    case "PaymentAuthorised":
      return { ...payment, state: newState };

    case "PaymentAttemptCreated":
      return {
        ...payment,
        attempts: [...payment.attempts, event.attemptId],
        currentAttemptId: event.attemptId,
      };

    case "PaymentSentToRail":
      return {
        ...payment,
        state: newState,
        externalRef: event.externalRef,
      };

    case "PaymentAcknowledged":
      return {
        ...payment,
        state: newState,
        schemeRef: event.schemeRef,
      };

    case "PaymentSettled":
      return {
        ...payment,
        state: newState,
        settlementRef: event.settlementRef,
        settledAt: event.occurredAt,
      };

    case "PaymentFailed":
      return {
        ...payment,
        state: newState,
        failedAt: event.occurredAt,
      };

    case "PaymentExpired":
      return {
        ...payment,
        state: newState,
        expiredAt: event.occurredAt,
      };

    case "OpsOverrideApplied":
      return {
        ...payment,
        state: event.toState,
      };

    default:
      throw new Error(`UNKNOWN_EVENT_TYPE: ${(event as any).type}`);
  }
}

/**
 * Rebuild payment state from events (replay)
 */
export function rebuildFromEvents(
  events: NPPPaymentEventUnion[]
): NPPPayment {
  if (events.length === 0) {
    throw new Error("REPLAY_ERROR: No events to replay");
  }

  const firstEvent = events[0];
  if (firstEvent.type !== "PaymentIntentCreated") {
    throw new Error("REPLAY_ERROR: First event must be PaymentIntentCreated");
  }

  let payment = createNPPPayment(firstEvent);

  for (let i = 1; i < events.length; i++) {
    payment = applyEvent(payment, events[i]);
  }

  return payment;
}
