/**
 * BECS Invariants - Immutable Business Rules
 * 
 * These invariants enforce BECS-specific business rules that must hold true
 * across all payment state transitions.
 * 
 * Key BECS Invariants:
 * 1. Batch Integrity - Batch totals must reconcile
 * 2. Late Returns - Returns can arrive days after clearing
 * 3. File-Level Failures - Entire batches can be rejected
 * 4. Item-Level Returns - Individual payments can be returned
 * 5. Settlement Not Final - Until return window closes
 * 
 * Invariant Categories:
 * - State Transition Invariants
 * - Economic Invariants
 * - Batch Integrity Invariants
 * - Return Handling Invariants
 */

import { BECSPaymentState, isBECSTerminalState } from "./BECSPaymentState";
import { isBECSTransitionLegal } from "./BECSStateTransitions";
import { BECSPaymentEvent } from "./BECSPaymentEvent";

/**
 * Category 1: State Transition Invariants
 */

/**
 * Assert that a state transition is legal
 */
export function assertBECSTransitionLegal(
  from: BECSPaymentState,
  to: BECSPaymentState
): void {
  if (!isBECSTransitionLegal(from, to)) {
    throw new Error(
      `INVARIANT_VIOLATION: Illegal BECS state transition from ${from} to ${to}`
    );
  }
}

/**
 * Assert that the current state is not terminal
 * 
 * Terminal states (RETURNED, FAILED, EXPIRED) cannot transition to any other state
 */
export function assertNotBECSTerminal(state: BECSPaymentState): void {
  if (isBECSTerminalState(state)) {
    throw new Error(
      `INVARIANT_VIOLATION: Cannot transition from terminal state ${state}`
    );
  }
}

/**
 * Category 2: Economic Invariants
 */

/**
 * Assert single settlement
 * 
 * A payment can only be settled once (excluding returns which reverse settlement)
 */
export function assertSingleBECSSettlement(events: BECSPaymentEvent[]): void {
  const settlementEvents = events.filter((e) => e.type === "PaymentSettled");
  
  if (settlementEvents.length > 1) {
    throw new Error(
      `INVARIANT_VIOLATION: Multiple settlement events detected (${settlementEvents.length})`
    );
  }
}

/**
 * Assert funds conservation
 * 
 * Total funds earmarked must equal total funds transferred or released
 * 
 * Note: This invariant only applies to terminal states.
 * Intermediate states (BATCHED, SUBMITTED, CLEARED) are allowed to have
 * earmarked funds that haven't been accounted for yet.
 */
export function assertBECSFundsConservation(events: BECSPaymentEvent[]): void {
  let totalEarmarked = 0n;
  let totalTransferred = 0n;
  let totalReleased = 0n;
  let totalReversed = 0n;

  for (const event of events) {
    if (event.type === "PaymentAuthorised") {
      totalEarmarked += event.fundsEarmarked;
    } else if (event.type === "PaymentSettled") {
      totalTransferred += event.fundsTransferred;
    } else if (event.type === "PaymentFailed" || event.type === "PaymentExpired") {
      totalReleased += event.fundsReleased;
    } else if (event.type === "PaymentReturned") {
      totalReversed += event.fundsReversed;
    }
  }

  const totalAccountedFor = totalTransferred + totalReleased + totalReversed;

  // Only enforce conservation if funds have been accounted for
  // (i.e., terminal state reached)
  if (totalAccountedFor > 0n && totalEarmarked !== totalAccountedFor) {
    throw new Error(
      `INVARIANT_VIOLATION: Funds conservation violated. Earmarked: ${totalEarmarked}, Accounted for: ${totalAccountedFor}`
    );
  }
}

/**
 * Category 3: Batch Integrity Invariants
 */

/**
 * Assert batch totals reconcile
 * 
 * BECS-SPECIFIC: Batch total must equal sum of individual payment amounts
 */
export function assertBatchTotalsReconcile(
  batchEvents: BECSPaymentEvent[],
  declaredTotal: bigint
): void {
  const paymentBatchedEvents = batchEvents.filter(
    (e) => e.type === "PaymentBatched"
  );

  const calculatedTotal = paymentBatchedEvents.reduce(
    (sum, e) => sum + (e.type === "PaymentBatched" ? e.fundsHeld : 0n),
    0n
  );

  if (calculatedTotal !== declaredTotal) {
    throw new Error(
      `INVARIANT_VIOLATION: Batch total mismatch. Declared: ${declaredTotal}, Calculated: ${calculatedTotal}`
    );
  }
}

/**
 * Assert batch file integrity
 * 
 * All payments in a batch must have the same batch ID and batch date
 */
export function assertBatchFileIntegrity(events: BECSPaymentEvent[]): void {
  const batchedEvents = events.filter((e) => e.type === "PaymentBatched");
  
  if (batchedEvents.length === 0) {
    return; // No batch events yet
  }

  const firstBatchEvent = batchedEvents[0];
  if (firstBatchEvent.type !== "PaymentBatched") {
    return;
  }

  const batchId = firstBatchEvent.batchId;
  const batchDate = firstBatchEvent.batchDate;

  for (const event of batchedEvents) {
    if (event.type === "PaymentBatched") {
      if (event.batchId !== batchId) {
        throw new Error(
          `INVARIANT_VIOLATION: Batch ID mismatch. Expected: ${batchId}, Got: ${event.batchId}`
        );
      }
      if (event.batchDate !== batchDate) {
        throw new Error(
          `INVARIANT_VIOLATION: Batch date mismatch. Expected: ${batchDate}, Got: ${event.batchDate}`
        );
      }
    }
  }
}

/**
 * Category 4: Return Handling Invariants
 */

/**
 * Assert return only from CLEARED state
 * 
 * BECS-SPECIFIC: Returns can only occur after clearing
 */
export function assertReturnOnlyFromCleared(
  currentState: BECSPaymentState
): void {
  if (currentState !== BECSPaymentState.CLEARED) {
    throw new Error(
      `INVARIANT_VIOLATION: Return only allowed from CLEARED state, current state is ${currentState}`
    );
  }
}

/**
 * Assert single return
 * 
 * A payment can only be returned once
 */
export function assertSingleReturn(events: BECSPaymentEvent[]): void {
  const returnEvents = events.filter((e) => e.type === "PaymentReturned");
  
  if (returnEvents.length > 1) {
    throw new Error(
      `INVARIANT_VIOLATION: Multiple return events detected (${returnEvents.length})`
    );
  }
}

/**
 * Assert return reverses ledger
 * 
 * BECS-SPECIFIC: Return must reverse the exact amount that was cleared
 */
export function assertReturnReversesLedger(events: BECSPaymentEvent[]): void {
  const clearedEvent = events.find((e) => e.type === "PaymentCleared");
  const returnEvent = events.find((e) => e.type === "PaymentReturned");

  if (!clearedEvent || !returnEvent) {
    return; // Not applicable if no return yet
  }

  if (clearedEvent.type === "PaymentCleared" && returnEvent.type === "PaymentReturned") {
    if (clearedEvent.fundsProvisional !== returnEvent.fundsReversed) {
      throw new Error(
        `INVARIANT_VIOLATION: Return amount mismatch. Cleared: ${clearedEvent.fundsProvisional}, Reversed: ${returnEvent.fundsReversed}`
      );
    }
  }
}

/**
 * Category 5: Idempotency Invariants
 */

/**
 * Assert unique idempotency key
 * 
 * Each payment intent must have a unique idempotency key
 */
export function assertUniqueIdempotencyKey(
  events: BECSPaymentEvent[],
  idempotencyKey: string
): void {
  const intentEvents = events.filter((e) => e.type === "PaymentIntentCreated");
  
  if (intentEvents.length > 1) {
    throw new Error(
      `INVARIANT_VIOLATION: Multiple payment intents with same idempotency key: ${idempotencyKey}`
    );
  }
}

/**
 * Validate all BECS invariants for a payment
 * 
 * This is the master invariant checker that runs all category checks
 */
export function validateAllBECSInvariants(
  events: BECSPaymentEvent[],
  currentState: BECSPaymentState
): void {
  // State transition invariants are checked during state transitions
  
  // Economic invariants
  assertSingleBECSSettlement(events);
  assertBECSFundsConservation(events);
  
  // Batch integrity invariants
  assertBatchFileIntegrity(events);
  
  // Return handling invariants
  assertSingleReturn(events);
  assertReturnReversesLedger(events);
  
  // Idempotency invariants
  const intentEvent = events.find((e) => e.type === "PaymentIntentCreated");
  if (intentEvent && intentEvent.type === "PaymentIntentCreated") {
    assertUniqueIdempotencyKey(events, intentEvent.idempotencyKey);
  }
}
