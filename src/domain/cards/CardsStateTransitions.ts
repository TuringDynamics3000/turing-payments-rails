import { CardsPaymentState } from "./CardsPaymentState";

/**
 * Cards State Transition Matrix
 * 
 * This is law. Anything outside this table must hard-fail.
 * 
 * Critical transitions:
 * - AUTHORISED can expire (time-based)
 * - SETTLED can chargeback (reversibility)
 * - CHARGEBACK can be represented (dispute)
 * - REPRESENTED can settle again (won dispute)
 */
export const CARDS_ALLOWED_TRANSITIONS: Record<
  CardsPaymentState,
  CardsPaymentState[]
> = {
  [CardsPaymentState.CREATED]: [
    CardsPaymentState.AUTHORISED,
    CardsPaymentState.DECLINED,
  ],
  
  [CardsPaymentState.AUTHORISED]: [
    CardsPaymentState.CAPTURED,
    CardsPaymentState.EXPIRED,
  ],
  
  [CardsPaymentState.CAPTURED]: [
    CardsPaymentState.CAPTURED, // Allow multiple partial captures
    CardsPaymentState.CLEARED,
    CardsPaymentState.FAILED,
  ],
  
  [CardsPaymentState.CLEARED]: [
    CardsPaymentState.SETTLED,
  ],
  
  [CardsPaymentState.SETTLED]: [
    CardsPaymentState.CHARGEBACK,
  ],
  
  [CardsPaymentState.CHARGEBACK]: [
    CardsPaymentState.REPRESENTED,
    CardsPaymentState.WRITTEN_OFF,
  ],
  
  [CardsPaymentState.REPRESENTED]: [
    CardsPaymentState.SETTLED,
    CardsPaymentState.WRITTEN_OFF,
  ],
  
  // Terminal states
  [CardsPaymentState.DECLINED]: [],
  [CardsPaymentState.EXPIRED]: [],
  [CardsPaymentState.WRITTEN_OFF]: [],
  [CardsPaymentState.FAILED]: [],
};

/**
 * Check if a state transition is legal
 */
export function isCardsTransitionLegal(
  from: CardsPaymentState,
  to: CardsPaymentState
): boolean {
  const allowedTransitions = CARDS_ALLOWED_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Get terminal states (no outgoing transitions)
 */
export function getCardsTerminalStates(): CardsPaymentState[] {
  return Object.entries(CARDS_ALLOWED_TRANSITIONS)
    .filter(([_, transitions]) => transitions.length === 0)
    .map(([state, _]) => state as CardsPaymentState);
}
