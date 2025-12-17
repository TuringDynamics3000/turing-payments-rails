/**
 * Cards Payment Rail - Public API
 * 
 * Event-sourced card payment orchestration with:
 * - Auth/clearing/chargeback lifecycle
 * - Partial capture support
 * - Settlement reversibility
 * - Long-tail timeline handling
 */

// State
export { CardsPaymentState, CardsDeclineReason, CardsChargebackReason } from "./CardsPaymentState";

// State Transitions
export { CARDS_ALLOWED_TRANSITIONS, isCardsTransitionLegal, getCardsTerminalStates } from "./CardsStateTransitions";

// Events
export type { CardsPaymentEvent } from "./CardsPaymentEvent";

// Invariants & Guards
export {
  assertAuthAllowed,
  assertAuthNotExpired,
  assertCaptureAllowed,
  assertSettlementProvisional,
  assertNoSecondSettlement,
  assertChargebackAllowed,
  assertChargebackReversesLedger,
  assertCardsTransitionLegal,
  assertTerminalStateImmutable,
  assertFundsConservation,
} from "./CardsInvariants";

// Payment Aggregate
export type { CardsPayment, CaptureRecord } from "./CardsPayment";
export {
  createCardsPayment,
  applyCardsEvent,
  rebuildCardsFromEvents,
  getCardsPaymentHash,
} from "./CardsPayment";
