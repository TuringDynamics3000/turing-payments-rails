/**
 * Turing Payments Rails
 * 
 * Canonical payments orchestration, lifecycle enforcement, and evidence generation
 * for multi-rail financial systems.
 * 
 * @packageDocumentation
 */

// NPP (New Payments Platform)
export * from './domain/npp/index.js';

// BECS (Bulk Electronic Clearing System)
export * from './domain/becs/index.js';

// RTGS (Real-Time Gross Settlement)
export * from './domain/rtgs/index.js';

// Cards (Authorisation, Capture, Clearing, Settlement, Chargebacks)
export * from './domain/cards/index.js';

/**
 * Version information
 */
export const VERSION = '0.1.0';

/**
 * Architectural principles
 */
export const PRINCIPLES = {
  /**
   * Rails emit facts and decisions, never post to ledgers
   */
  NO_LEDGER_POSTING: true,
  
  /**
   * All state derived from immutable events
   */
  EVENT_SOURCED: true,
  
  /**
   * Replay must be deterministic
   */
  DETERMINISTIC_REPLAY: true,
  
  /**
   * Lifecycle invariants enforced in CI
   */
  INVARIANT_GUARDED: true,
  
  /**
   * Evidence is reproducible
   */
  EVIDENCE_FIRST: true,
} as const;
