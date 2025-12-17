/**
 * BECS Payment Events - Immutable Event Definitions
 * 
 * All BECS payment state is derived from these events.
 * Events are append-only and never mutated.
 * 
 * BECS-Specific Events:
 * - PaymentBatched: Payment added to batch file
 * - BatchSubmitted: Batch file submitted to BECS rail
 * - PaymentCleared: Payment cleared by BECS rail
 * - PaymentReturned: Payment returned/dishonoured
 * 
 * Shared Events (from NPP):
 * - PaymentIntentCreated
 * - PaymentAuthorised
 * - PaymentFailed
 * - PaymentExpired
 * - PaymentSettled
 */

import { BECSFailureReason, BECSReturnCode } from "./BECSPaymentState";

/**
 * Base Event Interface
 */
interface BECSBaseEvent {
  paymentIntentId: string;
  occurredAt: Date;
}

/**
 * PaymentIntentCreated - Intent exists, nothing executed
 */
export interface PaymentIntentCreated extends BECSBaseEvent {
  type: "PaymentIntentCreated";
  amount: bigint;
  currency: string;
  idempotencyKey: string;
  fromAccountId: string;
  toAccountId: string;
  bsb?: string; // BSB for BECS
  accountNumber?: string; // Account number for BECS
}

/**
 * PaymentAuthorised - Policy & balance checks passed
 */
export interface PaymentAuthorised extends BECSBaseEvent {
  type: "PaymentAuthorised";
  policyChecksPassed: boolean;
  fundsEarmarked: bigint;
}

/**
 * PaymentBatched - Added to batch file for submission
 * 
 * BECS-SPECIFIC: Payments are batched before submission
 */
export interface PaymentBatched extends BECSBaseEvent {
  type: "PaymentBatched";
  batchId: string;
  batchDate: string; // YYYY-MM-DD
  sequenceNumber: number; // Position in batch
  fundsHeld: bigint;
}

/**
 * BatchSubmitted - Batch file submitted to BECS rail
 * 
 * BECS-SPECIFIC: File-level event (not payment-level)
 * Emitted for each payment in the batch
 */
export interface BatchSubmitted extends BECSBaseEvent {
  type: "BatchSubmitted";
  batchId: string;
  fileReference: string; // BECS file reference
  declaredTotal: bigint; // Total amount in batch
  itemCount: number; // Number of payments in batch
}

/**
 * PaymentCleared - Payment cleared by BECS rail
 * 
 * BECS-SPECIFIC: Clearing ≠ settlement
 * Payments can still be returned after clearing
 */
export interface PaymentCleared extends BECSBaseEvent {
  type: "PaymentCleared";
  batchId: string;
  clearingDate: string; // YYYY-MM-DD
  fundsProvisional: bigint;
}

/**
 * PaymentSettled - Final settlement confirmed
 */
export interface PaymentSettled extends BECSBaseEvent {
  type: "PaymentSettled";
  batchId: string;
  settlementRef: string;
  settlementDate: string; // YYYY-MM-DD
  fundsTransferred: bigint;
}

/**
 * PaymentReturned - Payment returned/dishonoured
 * 
 * BECS-SPECIFIC: Returns can arrive days after clearing
 * This is a compensating event that reverses the ledger
 */
export interface PaymentReturned extends BECSBaseEvent {
  type: "PaymentReturned";
  batchId: string;
  returnCode: BECSReturnCode;
  returnDate: string; // YYYY-MM-DD
  returnReason: string;
  fundsReversed: bigint;
}

/**
 * PaymentFailed - Terminal failure
 */
export interface PaymentFailed extends BECSBaseEvent {
  type: "PaymentFailed";
  batchId?: string;
  reason: BECSFailureReason;
  fundsReleased: bigint;
}

/**
 * PaymentExpired - Time window elapsed
 */
export interface PaymentExpired extends BECSBaseEvent {
  type: "PaymentExpired";
  expiryReason: string;
  fundsReleased: bigint;
}

/**
 * OpsOverrideApplied - Operator action recorded
 */
export interface OpsOverrideApplied extends BECSBaseEvent {
  type: "OpsOverrideApplied";
  action: "RETRY" | "CANCEL" | "RESUBMIT" | "MANUAL_RETURN";
  operatorId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Union type of all BECS payment events
 */
export type BECSPaymentEvent =
  | PaymentIntentCreated
  | PaymentAuthorised
  | PaymentBatched
  | BatchSubmitted
  | PaymentCleared
  | PaymentSettled
  | PaymentReturned
  | PaymentFailed
  | PaymentExpired
  | OpsOverrideApplied;

/**
 * Event type guard helpers
 */
export function isPaymentIntentCreated(event: BECSPaymentEvent): event is PaymentIntentCreated {
  return event.type === "PaymentIntentCreated";
}

export function isPaymentAuthorised(event: BECSPaymentEvent): event is PaymentAuthorised {
  return event.type === "PaymentAuthorised";
}

export function isPaymentBatched(event: BECSPaymentEvent): event is PaymentBatched {
  return event.type === "PaymentBatched";
}

export function isBatchSubmitted(event: BECSPaymentEvent): event is BatchSubmitted {
  return event.type === "BatchSubmitted";
}

export function isPaymentCleared(event: BECSPaymentEvent): event is PaymentCleared {
  return event.type === "PaymentCleared";
}

export function isPaymentSettled(event: BECSPaymentEvent): event is PaymentSettled {
  return event.type === "PaymentSettled";
}

export function isPaymentReturned(event: BECSPaymentEvent): event is PaymentReturned {
  return event.type === "PaymentReturned";
}

export function isPaymentFailed(event: BECSPaymentEvent): event is PaymentFailed {
  return event.type === "PaymentFailed";
}

export function isPaymentExpired(event: BECSPaymentEvent): event is PaymentExpired {
  return event.type === "PaymentExpired";
}

export function isOpsOverrideApplied(event: BECSPaymentEvent): event is OpsOverrideApplied {
  return event.type === "OpsOverrideApplied";
}
