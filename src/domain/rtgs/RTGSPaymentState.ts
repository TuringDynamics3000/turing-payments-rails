/**
 * RTGS Payment States - Governance-First State Machine
 * 
 * RTGS (Real-Time Gross Settlement) is a high-value payment rail requiring:
 * - Approval workflows (maker-checker pattern)
 * - Dual-control verification (two independent approvers)
 * - Separation of duties (initiator ≠ approver)
 * - Audit trail for all approvals
 * 
 * State Flow:
 * CREATED → PENDING_APPROVAL → APPROVED → SENT → SETTLED
 *                            ↓
 *                         REJECTED
 * 
 * RTGS Characteristics:
 * - High-value payments (typically > $1M AUD)
 * - Real-time settlement (immediate finality)
 * - Irrevocable once sent
 * - Requires multiple approvals
 * - Full audit trail
 */

/**
 * RTGS Payment States
 */
export enum RTGSPaymentState {
  /**
   * CREATED - Intent exists, awaiting approval
   */
  CREATED = "CREATED",
  
  /**
   * PENDING_APPROVAL - Approval workflow initiated
   * Waiting for required approvals (dual-control)
   */
  PENDING_APPROVAL = "PENDING_APPROVAL",
  
  /**
   * APPROVED - All required approvals granted
   * Ready to send to RTGS rail
   */
  APPROVED = "APPROVED",
  
  /**
   * REJECTED - Approval denied
   * Terminal state - payment cannot proceed
   */
  REJECTED = "REJECTED",
  
  /**
   * SENT - Payment sent to RTGS rail
   * Awaiting settlement confirmation
   */
  SENT = "SENT",
  
  /**
   * SETTLED - Payment settled on RTGS rail
   * Terminal state - funds transferred
   */
  SETTLED = "SETTLED",
  
  /**
   * FAILED - Payment failed (rail error, timeout, etc.)
   * Terminal state - funds released
   */
  FAILED = "FAILED",
}

/**
 * RTGS Failure Reasons
 * 
 * Tracks why RTGS payments fail for audit and retry decisions
 */
export enum RTGSFailureReason {
  /**
   * RAIL - External RTGS rail failure
   * Retry: Safe
   */
  RAIL = "RAIL",
  
  /**
   * TIMEOUT - Settlement timeout
   * Retry: Safe (after investigation)
   */
  TIMEOUT = "TIMEOUT",
  
  /**
   * INSUFFICIENT_FUNDS - Balance check failed
   * Retry: Not safe (need funds)
   */
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  
  /**
   * INVALID_ACCOUNT - Account not found or invalid
   * Retry: Not safe (need valid account)
   */
  INVALID_ACCOUNT = "INVALID_ACCOUNT",
  
  /**
   * APPROVAL_EXPIRED - Approval expired before sending
   * Retry: Safe (re-request approval)
   */
  APPROVAL_EXPIRED = "APPROVAL_EXPIRED",
  
  /**
   * CANCELLED - Operator cancelled
   * Retry: Not safe (intentional cancellation)
   */
  CANCELLED = "CANCELLED",
}

/**
 * RTGS Approval Roles
 * 
 * Defines who can approve RTGS payments
 */
export enum RTGSApprovalRole {
  /**
   * INITIATOR - Created the payment intent
   * Cannot approve own payment (separation of duties)
   */
  INITIATOR = "INITIATOR",
  
  /**
   * FIRST_APPROVER - First level approval
   * Typically manager or senior operator
   */
  FIRST_APPROVER = "FIRST_APPROVER",
  
  /**
   * SECOND_APPROVER - Second level approval (dual-control)
   * Must be different from first approver
   */
  SECOND_APPROVER = "SECOND_APPROVER",
  
  /**
   * EXECUTIVE_APPROVER - Executive level approval
   * Required for very high-value payments
   */
  EXECUTIVE_APPROVER = "EXECUTIVE_APPROVER",
}

/**
 * RTGS Approval Thresholds
 * 
 * Defines approval requirements based on payment amount
 */
export interface RTGSApprovalThreshold {
  /**
   * Minimum amount for this threshold (in cents)
   */
  readonly minAmount: bigint;
  
  /**
   * Maximum amount for this threshold (in cents)
   * undefined = no upper limit
   */
  readonly maxAmount?: bigint;
  
  /**
   * Required approval roles
   */
  readonly requiredRoles: RTGSApprovalRole[];
  
  /**
   * Minimum number of approvers
   */
  readonly minApprovers: number;
}

/**
 * Default RTGS Approval Thresholds
 * 
 * These can be customized per institution
 */
export const DEFAULT_RTGS_THRESHOLDS: RTGSApprovalThreshold[] = [
  {
    minAmount: 100000000n, // $1M
    maxAmount: 1000000000n, // $10M
    requiredRoles: [RTGSApprovalRole.FIRST_APPROVER, RTGSApprovalRole.SECOND_APPROVER],
    minApprovers: 2,
  },
  {
    minAmount: 1000000000n, // $10M
    maxAmount: undefined, // No upper limit
    requiredRoles: [
      RTGSApprovalRole.FIRST_APPROVER,
      RTGSApprovalRole.SECOND_APPROVER,
      RTGSApprovalRole.EXECUTIVE_APPROVER,
    ],
    minApprovers: 3,
  },
];

/**
 * Get required approval threshold for amount
 */
export function getApprovalThreshold(
  amount: bigint,
  thresholds: RTGSApprovalThreshold[] = DEFAULT_RTGS_THRESHOLDS
): RTGSApprovalThreshold | undefined {
  return thresholds.find(
    (threshold) =>
      amount >= threshold.minAmount &&
      (threshold.maxAmount === undefined || amount <= threshold.maxAmount)
  );
}
