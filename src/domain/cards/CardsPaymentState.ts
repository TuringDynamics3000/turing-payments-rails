/**
 * Cards Payment States - Time-Separated Promises
 * 
 * Cards are NOT payments. They are time-separated promises where:
 * - Authorisation = A hold, not money
 * - Capture = Merchant intent, not final
 * - Clearing = Scheme confirmation
 * - Settlement = Provisional economic truth
 * - Chargeback = Settlement can be undone
 * 
 * Critical: auth ≠ settlement, settlement is reversible
 * 
 * State Flow:
 * CREATED → AUTHORISED → CAPTURED → CLEARED → SETTLED
 *         ↓              ↓                      ↓
 *      DECLINED      EXPIRED              CHARGEBACK → REPRESENTED → SETTLED
 *                                                    ↓
 *                                               WRITTEN_OFF
 */

/**
 * Cards Payment States
 */
export enum CardsPaymentState {
  /**
   * CREATED - Intent exists, awaiting authorisation
   */
  CREATED = "CREATED",
  
  /**
   * AUTHORISED - Hold placed, funds reserved
   * NOT posted to ledger (auth ≠ settlement)
   */
  AUTHORISED = "AUTHORISED",
  
  /**
   * CAPTURED - Merchant intent to settle
   * Can be partial (capture < auth)
   */
  CAPTURED = "CAPTURED",
  
  /**
   * CLEARED - Scheme confirmed
   * Ready for settlement
   */
  CLEARED = "CLEARED",
  
  /**
   * SETTLED - Provisionally settled
   * Still reversible via chargeback
   */
  SETTLED = "SETTLED",
  
  /**
   * CHARGEBACK - Settlement reversed
   * Customer disputed transaction
   */
  CHARGEBACK = "CHARGEBACK",
  
  /**
   * REPRESENTED - Merchant challenged chargeback
   * Awaiting final resolution
   */
  REPRESENTED = "REPRESENTED",
  
  /**
   * DECLINED - Authorisation declined
   * Terminal state
   */
  DECLINED = "DECLINED",
  
  /**
   * EXPIRED - Authorisation expired before capture
   * Terminal state - hold released
   */
  EXPIRED = "EXPIRED",
  
  /**
   * WRITTEN_OFF - Chargeback accepted, loss recognized
   * Terminal state
   */
  WRITTEN_OFF = "WRITTEN_OFF",
  
  /**
   * FAILED - Payment failed during clearing
   * Terminal state
   */
  FAILED = "FAILED",
}

/**
 * Cards Decline Reasons
 */
export enum CardsDeclineReason {
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  INVALID_CARD = "INVALID_CARD",
  EXPIRED_CARD = "EXPIRED_CARD",
  FRAUD_SUSPECTED = "FRAUD_SUSPECTED",
  LIMIT_EXCEEDED = "LIMIT_EXCEEDED",
  ISSUER_DECLINED = "ISSUER_DECLINED",
}

/**
 * Cards Chargeback Reasons (Visa/Mastercard codes)
 */
export enum CardsChargebackReason {
  FRAUD = "FRAUD",
  GOODS_NOT_RECEIVED = "GOODS_NOT_RECEIVED",
  GOODS_NOT_AS_DESCRIBED = "GOODS_NOT_AS_DESCRIBED",
  DUPLICATE_PROCESSING = "DUPLICATE_PROCESSING",
  CREDIT_NOT_PROCESSED = "CREDIT_NOT_PROCESSED",
  CANCELLED_RECURRING = "CANCELLED_RECURRING",
  OTHER = "OTHER",
}
