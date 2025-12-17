import { CardsPaymentState, CardsDeclineReason, CardsChargebackReason } from "./CardsPaymentState";

/**
 * Cards Payment Events
 * 
 * Event-sourced representation of card payment lifecycle.
 * Critical: auth ≠ settlement, settlement is reversible
 */

/**
 * Base event properties
 */
interface BaseCardsEvent {
  paymentIntentId: string;
  occurredAt: Date;
}

/**
 * PaymentIntentCreated - Initial event
 */
export interface PaymentIntentCreatedEvent extends BaseCardsEvent {
  type: "PaymentIntentCreated";
  amount: bigint;
  currency: string;
  cardToken: string;
  merchantId: string;
  idempotencyKey: string;
}

/**
 * PaymentAuthorised - Hold placed, NOT posted to ledger
 * 
 * Critical: This is a hold, not money movement
 */
export interface PaymentAuthorisedEvent extends BaseCardsEvent {
  type: "PaymentAuthorised";
  authCode: string;
  authorisedAmount: bigint;
  expiresAt: Date;
  holdPlaced: bigint; // Amount held, NOT debited
}

/**
 * PaymentCaptured - Merchant intent to settle
 * 
 * Can be partial (captureAmount < authorisedAmount)
 * Multiple captures allowed (hotels, fuel stations)
 */
export interface PaymentCapturedEvent extends BaseCardsEvent {
  type: "PaymentCaptured";
  captureAmount: bigint;
  captureSequence: number; // For partial captures
  totalCaptured: bigint; // Running total
}

/**
 * PaymentCleared - Scheme confirmed
 */
export interface PaymentClearedEvent extends BaseCardsEvent {
  type: "PaymentCleared";
  clearedAt: Date;
  schemeTransactionId: string;
  clearedAmount: bigint;
}

/**
 * PaymentSettled - Provisionally settled
 * 
 * Critical: Still reversible via chargeback
 */
export interface PaymentSettledEvent extends BaseCardsEvent {
  type: "PaymentSettled";
  settledAt: Date;
  settledAmount: bigint;
  provisional: true; // Always true for cards
  fundsTransferred: bigint;
}

/**
 * PaymentChargeback - Settlement reversed
 * 
 * Customer disputed transaction
 */
export interface PaymentChargebackEvent extends BaseCardsEvent {
  type: "PaymentChargeback";
  chargebackReason: CardsChargebackReason;
  chargebackAmount: bigint;
  receivedAt: Date;
  responseDeadline: Date;
  fundsReversed: bigint; // Ledger reversal
}

/**
 * PaymentRepresented - Merchant challenged chargeback
 */
export interface PaymentRepresentedEvent extends BaseCardsEvent {
  type: "PaymentRepresented";
  representmentEvidence: string; // Evidence document ID
  representedAt: Date;
  representmentAmount: bigint;
}

/**
 * PaymentDeclined - Authorisation declined
 */
export interface PaymentDeclinedEvent extends BaseCardsEvent {
  type: "PaymentDeclined";
  declineReason: CardsDeclineReason;
  declinedAt: Date;
}

/**
 * PaymentExpired - Authorisation expired before capture
 */
export interface PaymentExpiredEvent extends BaseCardsEvent {
  type: "PaymentExpired";
  expiredAt: Date;
  holdReleased: bigint;
}

/**
 * PaymentWrittenOff - Chargeback accepted, loss recognized
 */
export interface PaymentWrittenOffEvent extends BaseCardsEvent {
  type: "PaymentWrittenOff";
  writtenOffAt: Date;
  lossAmount: bigint;
}

/**
 * PaymentFailed - Payment failed during clearing
 */
export interface PaymentFailedEvent extends BaseCardsEvent {
  type: "PaymentFailed";
  failedAt: Date;
  failureReason: string;
  holdReleased: bigint;
}

/**
 * Union type of all Cards payment events
 */
export type CardsPaymentEvent =
  | PaymentIntentCreatedEvent
  | PaymentAuthorisedEvent
  | PaymentCapturedEvent
  | PaymentClearedEvent
  | PaymentSettledEvent
  | PaymentChargebackEvent
  | PaymentRepresentedEvent
  | PaymentDeclinedEvent
  | PaymentExpiredEvent
  | PaymentWrittenOffEvent
  | PaymentFailedEvent;
