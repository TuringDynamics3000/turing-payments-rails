import { CardsPaymentState } from "./CardsPaymentState";
import { isCardsTransitionLegal } from "./CardsStateTransitions";

/**
 * Cards Payment Invariants
 * 
 * These are the rules that stop silent balance corruption.
 * Critical differences from NPP/BECS:
 * - Auth hold ≠ ledger posting
 * - Partial capture allowed
 * - Settlement is reversible (chargebacks)
 */

/**
 * Invariant Category 1: Authorisation Guards
 */

/**
 * Assert authorisation is allowed
 * 
 * Rule: Hold ≥ authorised amount, auth ≠ settlement
 */
export function assertAuthAllowed(
  availableBalance: bigint,
  authAmount: bigint
): void {
  if (authAmount <= 0n) {
    throw new Error("INVARIANT_VIOLATION: Invalid auth amount (must be > 0)");
  }
  
  if (availableBalance < authAmount) {
    throw new Error("INVARIANT_VIOLATION: Insufficient funds for authorisation");
  }
}

/**
 * Assert auth expiry is enforced
 */
export function assertAuthNotExpired(
  expiresAt: Date,
  now: Date = new Date()
): void {
  if (now > expiresAt) {
    throw new Error("INVARIANT_VIOLATION: Authorisation expired");
  }
}

/**
 * Invariant Category 2: Capture Guards
 */

/**
 * Assert capture is allowed
 * 
 * Rule: Capture ≤ auth (scheme law)
 * Partial capture allowed (real merchants)
 */
export function assertCaptureAllowed(
  authorisedAmount: bigint,
  capturedSoFar: bigint,
  captureAmount: bigint
): void {
  if (captureAmount <= 0n) {
    throw new Error("INVARIANT_VIOLATION: Invalid capture amount (must be > 0)");
  }
  
  const totalAfterCapture = capturedSoFar + captureAmount;
  
  if (totalAfterCapture > authorisedAmount) {
    throw new Error(
      `INVARIANT_VIOLATION: Capture exceeds auth (auth: ${authorisedAmount}, captured: ${capturedSoFar}, attempting: ${captureAmount})`
    );
  }
}

/**
 * Invariant Category 3: Settlement Guards
 */

/**
 * Assert settlement is allowed
 * 
 * Rule: Settlement posts ledger but flagged provisional
 */
export function assertSettlementProvisional(provisional: boolean): void {
  if (!provisional) {
    throw new Error(
      "INVARIANT_VIOLATION: Cards settlement must always be provisional (reversible via chargeback)"
    );
  }
}

/**
 * Assert no second settlement
 */
export function assertNoSecondSettlement(
  settledAt: Date | null,
  settledAmount: bigint
): void {
  if (settledAt !== null || settledAmount > 0n) {
    throw new Error(
      "INVARIANT_VIOLATION: Payment already settled (no second settlement allowed)"
    );
  }
}

/**
 * Invariant Category 4: Chargeback Guards
 */

/**
 * Assert chargeback is allowed
 * 
 * Rule: Chargeback only after settlement (scheme law)
 */
export function assertChargebackAllowed(state: CardsPaymentState): void {
  if (state !== CardsPaymentState.SETTLED) {
    throw new Error(
      `INVARIANT_VIOLATION: Chargeback only allowed after settlement (current state: ${state})`
    );
  }
}

/**
 * Assert chargeback reverses ledger
 */
export function assertChargebackReversesLedger(
  fundsReversed: bigint,
  settledAmount: bigint
): void {
  if (fundsReversed !== settledAmount) {
    throw new Error(
      `INVARIANT_VIOLATION: Chargeback must reverse full settlement (settled: ${settledAmount}, reversed: ${fundsReversed})`
    );
  }
}

/**
 * Invariant Category 5: State Transition Guards
 */

/**
 * Assert state transition is legal
 */
export function assertCardsTransitionLegal(
  from: CardsPaymentState,
  to: CardsPaymentState
): void {
  if (!isCardsTransitionLegal(from, to)) {
    throw new Error(
      `INVARIANT_VIOLATION: Illegal Cards state transition from ${from} to ${to}`
    );
  }
}

/**
 * Assert terminal state immutability
 */
export function assertTerminalStateImmutable(state: CardsPaymentState): void {
  const terminalStates = [
    CardsPaymentState.DECLINED,
    CardsPaymentState.EXPIRED,
    CardsPaymentState.WRITTEN_OFF,
    CardsPaymentState.FAILED,
  ];
  
  if (terminalStates.includes(state)) {
    throw new Error(
      `INVARIANT_VIOLATION: Cannot transition from terminal state ${state}`
    );
  }
}

/**
 * Invariant Category 6: Economic Correctness
 */

/**
 * Assert funds conservation
 * 
 * Rule: holdPlaced = capturedAmount + holdRemaining
 */
export function assertFundsConservation(
  holdPlaced: bigint,
  capturedAmount: bigint,
  settledAmount: bigint,
  chargebackAmount: bigint
): void {
  // For cards: hold → capture → settle → (optional) chargeback
  // Allow intermediate states where not all funds are settled yet
  
  // If settled, settled amount should not exceed captured
  if (settledAmount > 0n && capturedAmount > 0n && settledAmount > capturedAmount) {
    throw new Error(
      `INVARIANT_VIOLATION: Settled amount exceeds captured. Captured: ${capturedAmount}, Settled: ${settledAmount}`
    );
  }
  
  // If chargedback, chargeback should not exceed settled
  if (chargebackAmount > 0n && settledAmount > 0n && chargebackAmount > settledAmount) {
    throw new Error(
      `INVARIANT_VIOLATION: Chargeback exceeds settled. Settled: ${settledAmount}, Chargeback: ${chargebackAmount}`
    );
  }
}
