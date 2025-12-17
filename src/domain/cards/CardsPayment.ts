import { CardsPaymentState } from "./CardsPaymentState";
import { CardsPaymentEvent } from "./CardsPaymentEvent";
import {
  assertCardsTransitionLegal,
  assertTerminalStateImmutable,
  assertFundsConservation,
} from "./CardsInvariants";
import { createHash } from "crypto";

/**
 * Cards Payment Aggregate
 * 
 * Event-sourced representation of card payment state.
 * Critical: auth ≠ settlement, settlement is reversible
 */

/**
 * Capture record for partial captures
 */
export interface CaptureRecord {
  captureAmount: bigint;
  captureSequence: number;
  capturedAt: Date;
}

/**
 * Cards Payment State
 */
export interface CardsPayment {
  // Identity
  paymentIntentId: string;
  
  // State
  state: CardsPaymentState;
  version: number; // Event count
  
  // Payment details
  amount: bigint;
  currency: string;
  cardToken: string;
  merchantId: string;
  
  // Authorisation
  authCode: string | null;
  authorisedAmount: bigint;
  authExpiresAt: Date | null;
  holdPlaced: bigint; // NOT posted to ledger
  
  // Capture (can be partial)
  captures: CaptureRecord[];
  totalCaptured: bigint;
  
  // Clearing & Settlement
  clearedAt: Date | null;
  clearedAmount: bigint;
  settledAt: Date | null;
  settledAmount: bigint;
  
  // Chargeback
  chargebackAmount: bigint;
  chargebackAt: Date | null;
  fundsReversed: bigint; // Ledger reversal
  
  // Representment
  representedAt: Date | null;
  representmentAmount: bigint;
  
  // Terminal states
  declinedAt: Date | null;
  expiredAt: Date | null;
  writtenOffAt: Date | null;
  failedAt: Date | null;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create new Cards payment from intent
 */
export function createCardsPayment(
  event: Extract<CardsPaymentEvent, { type: "PaymentIntentCreated" }>
): CardsPayment {
  return {
    paymentIntentId: event.paymentIntentId,
    state: CardsPaymentState.CREATED,
    version: 1,
    amount: event.amount,
    currency: event.currency,
    cardToken: event.cardToken,
    merchantId: event.merchantId,
    authCode: null,
    authorisedAmount: 0n,
    authExpiresAt: null,
    holdPlaced: 0n,
    captures: [],
    totalCaptured: 0n,
    clearedAt: null,
    clearedAmount: 0n,
    settledAt: null,
    settledAmount: 0n,
    chargebackAmount: 0n,
    chargebackAt: null,
    fundsReversed: 0n,
    representedAt: null,
    representmentAmount: 0n,
    declinedAt: null,
    expiredAt: null,
    writtenOffAt: null,
    failedAt: null,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
}

/**
 * Apply event to Cards payment
 */
export function applyCardsEvent(
  payment: CardsPayment,
  event: CardsPaymentEvent
): CardsPayment {
  // Determine next state based on event type
  let nextState = payment.state;
  
  switch (event.type) {
    case "PaymentIntentCreated":
      nextState = CardsPaymentState.CREATED;
      break;
    case "PaymentAuthorised":
      nextState = CardsPaymentState.AUTHORISED;
      break;
    case "PaymentCaptured":
      nextState = CardsPaymentState.CAPTURED;
      break;
    case "PaymentCleared":
      nextState = CardsPaymentState.CLEARED;
      break;
    case "PaymentSettled":
      nextState = CardsPaymentState.SETTLED;
      break;
    case "PaymentChargeback":
      nextState = CardsPaymentState.CHARGEBACK;
      break;
    case "PaymentRepresented":
      nextState = CardsPaymentState.REPRESENTED;
      break;
    case "PaymentDeclined":
      nextState = CardsPaymentState.DECLINED;
      break;
    case "PaymentExpired":
      nextState = CardsPaymentState.EXPIRED;
      break;
    case "PaymentWrittenOff":
      nextState = CardsPaymentState.WRITTEN_OFF;
      break;
    case "PaymentFailed":
      nextState = CardsPaymentState.FAILED;
      break;
  }
  
  // Validate state transition
  assertCardsTransitionLegal(payment.state, nextState);
  assertTerminalStateImmutable(payment.state);
  
  // Apply event-specific changes
  const updated = { ...payment, state: nextState, version: payment.version + 1, updatedAt: event.occurredAt };
  
  switch (event.type) {
    case "PaymentAuthorised":
      updated.authCode = event.authCode;
      updated.authorisedAmount = event.authorisedAmount;
      updated.authExpiresAt = event.expiresAt;
      updated.holdPlaced = event.holdPlaced;
      break;
      
    case "PaymentCaptured":
      updated.captures.push({
        captureAmount: event.captureAmount,
        captureSequence: event.captureSequence,
        capturedAt: event.occurredAt,
      });
      updated.totalCaptured = event.totalCaptured;
      break;
      
    case "PaymentCleared":
      updated.clearedAt = event.clearedAt;
      updated.clearedAmount = event.clearedAmount;
      break;
      
    case "PaymentSettled":
      updated.settledAt = event.settledAt;
      updated.settledAmount = event.settledAmount;
      break;
      
    case "PaymentChargeback":
      updated.chargebackAmount = event.chargebackAmount;
      updated.chargebackAt = event.receivedAt;
      updated.fundsReversed = event.fundsReversed;
      break;
      
    case "PaymentRepresented":
      updated.representedAt = event.representedAt;
      updated.representmentAmount = event.representmentAmount;
      break;
      
    case "PaymentDeclined":
      updated.declinedAt = event.declinedAt;
      break;
      
    case "PaymentExpired":
      updated.expiredAt = event.expiredAt;
      break;
      
    case "PaymentWrittenOff":
      updated.writtenOffAt = event.writtenOffAt;
      break;
      
    case "PaymentFailed":
      updated.failedAt = event.failedAt;
      break;
  }
  
  // Validate economic invariants
  assertFundsConservation(
    updated.holdPlaced,
    updated.totalCaptured,
    updated.settledAmount,
    updated.chargebackAmount
  );
  
  return updated;
}

/**
 * Rebuild Cards payment from event stream
 */
export function rebuildCardsFromEvents(
  events: CardsPaymentEvent[]
): CardsPayment {
  if (events.length === 0) {
    throw new Error("Cannot rebuild payment from empty event stream");
  }
  
  const firstEvent = events[0];
  if (firstEvent.type !== "PaymentIntentCreated") {
    throw new Error("First event must be PaymentIntentCreated");
  }
  
  let payment = createCardsPayment(firstEvent);
  
  for (let i = 1; i < events.length; i++) {
    payment = applyCardsEvent(payment, events[i]);
  }
  
  return payment;
}

/**
 * Get deterministic hash of Cards payment state
 */
export function getCardsPaymentHash(payment: CardsPayment): string {
  const stateSnapshot = {
    paymentIntentId: payment.paymentIntentId,
    state: payment.state,
    version: payment.version,
    amount: payment.amount.toString(),
    holdPlaced: payment.holdPlaced.toString(),
    totalCaptured: payment.totalCaptured.toString(),
    settledAmount: payment.settledAmount.toString(),
    chargebackAmount: payment.chargebackAmount.toString(),
  };
  
  return createHash("sha256")
    .update(JSON.stringify(stateSnapshot))
    .digest("hex");
}
