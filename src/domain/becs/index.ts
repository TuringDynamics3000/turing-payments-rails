/**
 * BECS Payment Rail - Public API
 * 
 * This module exports the public API for BECS payment orchestration.
 * 
 * BECS (Bulk Electronic Clearing System) is batch + delayed truth.
 * Payments are batched, submitted as files, and cleared days later.
 * 
 * Key BECS Realities:
 * - Batch processing (not real-time like NPP)
 * - Delayed settlement (T+1 to T+3 days)
 * - Late returns expected (dishonour days after apparent success)
 * - File-level failures (entire batch can be rejected)
 * 
 * Usage:
 * ```typescript
 * import { createBECSPayment, applyBECSEvent, rebuildBECSFromEvents } from "@/core/payments/becs";
 * 
 * const payment = createBECSPayment(intentEvent);
 * const updated = applyBECSEvent(payment, batchedEvent);
 * const rebuilt = rebuildBECSFromEvents(events);
 * ```
 */

// State machine
export {
  BECSPaymentState,
  BECSFailureReason,
  BECSReturnCode,
  BECS_TERMINAL_STATES,
  isBECSTerminalState,
} from "./BECSPaymentState";

// State transitions
export {
  BECS_ALLOWED_TRANSITIONS,
  isBECSTransitionLegal,
  getBECSLegalNextStates,
} from "./BECSStateTransitions";

// Events
export type {
  BECSPaymentEvent,
  PaymentIntentCreated,
  PaymentAuthorised,
  PaymentBatched,
  BatchSubmitted,
  PaymentCleared,
  PaymentSettled,
  PaymentReturned,
  PaymentFailed,
  PaymentExpired,
  OpsOverrideApplied,
} from "./BECSPaymentEvent";

export {
  isPaymentIntentCreated,
  isPaymentAuthorised,
  isPaymentBatched,
  isBatchSubmitted,
  isPaymentCleared,
  isPaymentSettled,
  isPaymentReturned,
  isPaymentFailed,
  isPaymentExpired,
  isOpsOverrideApplied,
} from "./BECSPaymentEvent";

// Invariants
export {
  assertBECSTransitionLegal,
  assertNotBECSTerminal,
  assertSingleBECSSettlement,
  assertBECSFundsConservation,
  assertBatchTotalsReconcile,
  assertBatchFileIntegrity,
  assertReturnOnlyFromCleared,
  assertSingleReturn,
  assertReturnReversesLedger,
  assertUniqueIdempotencyKey,
  validateAllBECSInvariants,
} from "./BECSInvariants";

// Payment aggregate
export type { BECSPayment } from "./BECSPayment";

export {
  createBECSPayment,
  applyBECSEvent,
  rebuildBECSFromEvents,
  computeBECSStateHash,
  isBECSPaymentTerminal,
  canRetryBECSPayment,
  canCancelBECSPayment,
  canResubmitBECSPayment,
  canReturnBECSPayment,
} from "./BECSPayment";
