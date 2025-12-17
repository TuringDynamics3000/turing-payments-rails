/**
 * RTGS Payment Events
 * 
 * Event-sourced events for RTGS payment lifecycle.
 * Every state change is driven by an immutable event.
 * 
 * RTGS-Specific Events:
 * - ApprovalRequested
 * - ApprovalGranted
 * - ApprovalRejected
 * - DualControlVerified
 * 
 * All events include approval metadata for audit trail.
 */

import { RTGSPaymentState, RTGSFailureReason, RTGSApprovalRole } from "./RTGSPaymentState";

/**
 * Base RTGS Payment Event
 */
interface BaseRTGSEvent {
  readonly paymentIntentId: string;
  readonly occurredAt: Date;
}

/**
 * Payment Intent Created
 * 
 * Initial event - payment intent created
 */
export interface PaymentIntentCreated extends BaseRTGSEvent {
  readonly type: "PaymentIntentCreated";
  readonly amount: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly bsb: string;
  readonly accountNumber: string;
  readonly initiatorId: string; // Who created the payment
  readonly initiatorRole: RTGSApprovalRole;
}

/**
 * Approval Requested
 * 
 * Approval workflow initiated
 * Includes required approvers and threshold
 */
export interface ApprovalRequested extends BaseRTGSEvent {
  readonly type: "ApprovalRequested";
  readonly requiredApprovers: number;
  readonly requiredRoles: RTGSApprovalRole[];
  readonly approvalThreshold: bigint; // Amount threshold
  readonly expiresAt: Date; // Approval expiry
}

/**
 * Approval Granted
 * 
 * Single approval granted by an approver
 * Multiple ApprovalGranted events = dual-control
 */
export interface ApprovalGranted extends BaseRTGSEvent {
  readonly type: "ApprovalGranted";
  readonly approverId: string;
  readonly approverRole: RTGSApprovalRole;
  readonly approvalSequence: number; // 1st, 2nd, 3rd approver
  readonly approvalReason?: string;
}

/**
 * Dual Control Verified
 * 
 * All required approvals received
 * Payment ready to send
 */
export interface DualControlVerified extends BaseRTGSEvent {
  readonly type: "DualControlVerified";
  readonly approvers: Array<{
    approverId: string;
    approverRole: RTGSApprovalRole;
    approvedAt: Date;
  }>;
  readonly allRequirementsMet: boolean;
}

/**
 * Approval Rejected
 * 
 * Approval denied by an approver
 * Terminal event - payment cannot proceed
 */
export interface ApprovalRejected extends BaseRTGSEvent {
  readonly type: "ApprovalRejected";
  readonly rejectedBy: string;
  readonly rejectorRole: RTGSApprovalRole;
  readonly rejectionReason: string;
}

/**
 * Payment Authorised
 * 
 * Policy checks passed, funds earmarked
 */
export interface PaymentAuthorised extends BaseRTGSEvent {
  readonly type: "PaymentAuthorised";
  readonly policyChecksPassed: boolean;
  readonly fundsEarmarked: bigint;
}

/**
 * Payment Sent
 * 
 * Payment sent to RTGS rail
 */
export interface PaymentSent extends BaseRTGSEvent {
  readonly type: "PaymentSent";
  readonly railTransactionId: string;
  readonly sentAt: Date;
  readonly fundsDebited: bigint;
}

/**
 * Payment Settled
 * 
 * Payment settled on RTGS rail
 * Terminal success event
 */
export interface PaymentSettled extends BaseRTGSEvent {
  readonly type: "PaymentSettled";
  readonly settledAt: Date;
  readonly railConfirmationId: string;
  readonly fundsTransferred: bigint;
}

/**
 * Payment Failed
 * 
 * Payment failed at any stage
 * Terminal failure event
 */
export interface PaymentFailed extends BaseRTGSEvent {
  readonly type: "PaymentFailed";
  readonly reason: RTGSFailureReason;
  readonly failureMessage: string;
  readonly fundsReleased: bigint;
}

/**
 * Union type of all RTGS payment events
 */
export type RTGSPaymentEvent =
  | PaymentIntentCreated
  | ApprovalRequested
  | ApprovalGranted
  | DualControlVerified
  | ApprovalRejected
  | PaymentAuthorised
  | PaymentSent
  | PaymentSettled
  | PaymentFailed;

/**
 * Map event types to resulting states
 */
export const EVENT_TO_STATE_MAP: Record<RTGSPaymentEvent["type"], RTGSPaymentState> = {
  PaymentIntentCreated: RTGSPaymentState.CREATED,
  ApprovalRequested: RTGSPaymentState.PENDING_APPROVAL,
  ApprovalGranted: RTGSPaymentState.PENDING_APPROVAL, // Still pending until all approvals
  DualControlVerified: RTGSPaymentState.APPROVED,
  ApprovalRejected: RTGSPaymentState.REJECTED,
  PaymentAuthorised: RTGSPaymentState.APPROVED, // After dual-control
  PaymentSent: RTGSPaymentState.SENT,
  PaymentSettled: RTGSPaymentState.SETTLED,
  PaymentFailed: RTGSPaymentState.FAILED,
};
