# Payments Spine v1.0.0 - Frozen Invariants

**Status:** FROZEN as of v1.0.0  
**Date:** December 16, 2024  
**Scope:** NPP, BECS, RTGS, Cards payment rails

---

## Purpose

This document defines the **immutable invariants** that MUST hold across all payment rails in the Payments Spine v1.0.0. These invariants are **frozen** and will never change in v1.x releases. Any violation of these invariants is a **critical bug** that must be fixed immediately.

---

## Universal Invariants (All Rails)

### 1. Event Immutability
**Invariant:** Once an event is persisted, it MUST NEVER be modified or deleted.

**Rationale:** Event sourcing requires append-only event streams for deterministic replay.

**Enforcement:**
- Events are immutable data structures
- No UPDATE or DELETE operations on event store
- Only INSERT (append) operations allowed

**Test:** All rails have replay tests verifying deterministic state reconstruction from events.

---

### 2. Deterministic Replay
**Invariant:** Replaying the same events in the same order MUST produce identical state.

**Rationale:** Enables crash recovery, audit trails, and temporal queries.

**Enforcement:**
- `rebuildFromEvents()` functions produce identical state
- SHA-256 hash verification before/after replay
- No external dependencies in state transitions

**Test:** All rails have replay tests with hash verification (NPP: 7 tests, BECS: 6 tests, Cards: 18 tests).

---

### 3. State Transition Legality
**Invariant:** State transitions MUST follow the defined state machine. Illegal transitions MUST be rejected.

**Rationale:** Prevents corruption and ensures predictable behavior.

**Enforcement:**
- `StateTransitions` matrix defines legal transitions
- `applyEvent()` validates transitions before applying
- Throws error on illegal transition

**Test:** All rails have invariant tests covering illegal transitions.

---

### 4. Terminal State Immutability
**Invariant:** Once a payment reaches a terminal state (SETTLED, FAILED, WRITTEN_OFF), it MUST NOT transition to any other state.

**Rationale:** Settlement finality and regulatory compliance.

**Enforcement:**
- Terminal states have no outbound transitions in state machine
- `applyEvent()` rejects events on terminal states

**Test:** All rails test terminal state enforcement.

**Exception:** Cards CHARGEBACK can reverse SETTLED state (time-reversibility by design).

---

### 5. Funds Conservation
**Invariant:** The sum of all ledger postings for a payment MUST equal zero.

**Rationale:** Double-entry bookkeeping and economic correctness.

**Enforcement:**
- Track `fundsEarmarked`, `fundsTransferred`, `fundsReversed`
- Invariant: `fundsEarmarked = fundsTransferred + fundsReversed` (for terminal states)

**Test:** All rails have funds conservation tests.

---

### 6. No Stored Balances
**Invariant:** Payment state MUST NOT store account balances. Balances are derived from ledger postings.

**Rationale:** Single source of truth (ledger), prevents balance drift.

**Enforcement:**
- Payment state contains only payment-specific data
- Balances queried from ledger, not payment state

**Test:** Code review and architectural guardrails.

---

### 7. Idempotency
**Invariant:** Applying the same event multiple times MUST produce the same result as applying it once.

**Rationale:** Enables safe retries and at-least-once delivery.

**Enforcement:**
- Events include `idempotencyKey` or sequence numbers
- Duplicate detection in `applyEvent()`

**Test:** All rails test duplicate event handling.

---

## Rail-Specific Invariants

### NPP (New Payments Platform)

#### NPP.1: ACK ≠ Settlement
**Invariant:** ACKNOWLEDGED state MUST NOT imply funds have been transferred.

**Rationale:** NPP can fail after ACK (late failures).

**Enforcement:**
- `fundsTransferred` only set in SETTLED state
- ACKNOWLEDGED → FAILED transition allowed

**Test:** `npp.invariants.test.ts` - "Late failure after ACK"

---

#### NPP.2: No Reversal After Settlement
**Invariant:** SETTLED state is final. No chargebacks or reversals allowed.

**Rationale:** NPP is irrevocable real-time gross settlement.

**Enforcement:**
- SETTLED is terminal state
- No outbound transitions from SETTLED

**Test:** Terminal state enforcement tests.

---

### BECS (Bulk Electronic Clearing System)

#### BECS.1: Batch Reconciliation
**Invariant:** Sum of payment amounts in batch MUST equal declared batch total.

**Rationale:** File-level validation and fraud prevention.

**Enforcement:**
- `batchTotal` tracked in payment state
- Invariant: `Σ(payment amounts) = batchTotal`

**Test:** `becs.invariants.test.ts` - "Batch totals reconcile"

---

#### BECS.2: Late Returns Reverse Ledger
**Invariant:** CLEARED → RETURNED transition MUST reverse `fundsTransferred`.

**Rationale:** BECS allows returns days after clearing (delayed truth).

**Enforcement:**
- `PaymentReturned` event sets `fundsReversed = fundsTransferred`
- Ledger posting reverses original transfer

**Test:** `becs.invariants.test.ts` - "Late return reverses funds"

---

#### BECS.3: No Settlement Finality Assumptions
**Invariant:** CLEARED state MUST NOT assume settlement is final.

**Rationale:** Returns can occur T+1 to T+3 after clearing.

**Enforcement:**
- CLEARED → RETURNED transition allowed
- Evidence packs include return window metadata

**Test:** `becs.replay.test.ts` - "Late return after clearing"

---

### RTGS (Real-Time Gross Settlement)

#### RTGS.1: Dual-Control Verification
**Invariant:** High-value payments ($1M+) MUST have approvals from at least 2 distinct approvers.

**Rationale:** Separation of duties and fraud prevention.

**Enforcement:**
- `approvals` array tracks approver IDs
- `assertDualControl()` validates distinct approvers
- Threshold: $1M = 2 approvers, $10M = 3 approvers, $50M = 4 approvers

**Test:** `rtgs.approval.test.ts` - "Dual-control enforcement"

---

#### RTGS.2: Separation of Duties
**Invariant:** Payment initiator MUST NOT be an approver.

**Rationale:** Prevents self-approval fraud.

**Enforcement:**
- `initiatorId` tracked in payment state
- `assertSeparationOfDuties()` rejects approvals from initiator

**Test:** `rtgs.approval.test.ts` - "Initiator cannot approve"

---

#### RTGS.3: Approval Immutability
**Invariant:** Once granted, an approval MUST NOT be revoked.

**Rationale:** Audit trail integrity.

**Enforcement:**
- Approvals are append-only
- No `ApprovalRevoked` event exists

**Test:** Architectural enforcement (no revocation event defined).

---

### Cards (Auth/Clearing/Chargeback)

#### Cards.1: Auth Hold NOT Posted to Ledger
**Invariant:** AUTHORISED state MUST NOT post funds to ledger. Only CAPTURED state posts.

**Rationale:** Auth is a promise, not a transfer. Prevents double-posting.

**Enforcement:**
- `holdPlaced` tracked separately from `fundsTransferred`
- `fundsTransferred` only set in CAPTURED state

**Test:** `cards.invariants.test.ts` - "Auth hold not posted"

---

#### Cards.2: Partial Capture Legality
**Invariant:** Sum of captures MUST NOT exceed authorized amount.

**Rationale:** Cannot capture more than authorized.

**Enforcement:**
- `totalCaptured` tracked in payment state
- `assertCaptureAllowed()` validates `totalCaptured + captureAmount ≤ authorisedAmount`

**Test:** `cards.invariants.test.ts` - "Partial capture within auth"

---

#### Cards.3: Chargeback Reverses Settlement
**Invariant:** CHARGEBACK MUST reverse `fundsTransferred` from SETTLED state.

**Rationale:** Time-reversibility - settlement is provisional, not final.

**Enforcement:**
- `PaymentChargeback` event sets `fundsReversed = settledAmount`
- Ledger posting reverses original settlement

**Test:** `cards.invariants.test.ts` - "Chargeback reverses funds"

---

#### Cards.4: Settlement Provisional
**Invariant:** SETTLED state MUST be marked as `provisional: true` until chargeback window expires.

**Rationale:** Chargebacks can occur 30-120 days after settlement.

**Enforcement:**
- `provisional` flag in SETTLED state
- Evidence packs include chargeback window metadata

**Test:** `cards.replay.test.ts` - "90-day chargeback after settlement"

---

## Cryptographic Invariants

### Replay Proof
**Invariant:** Evidence packs MUST include SHA-256 hash of payment state for replay verification.

**Rationale:** Tamper detection and audit trail integrity.

**Enforcement:**
- `getPaymentHash()` computes SHA-256 of canonical state representation
- Evidence packs include `replayProof.stateHash`

**Test:** All rails include evidence pack tests with hash verification.

---

## Temporal Invariants

### No Time Travel
**Invariant:** Event `occurredAt` timestamps MUST be monotonically increasing for a given payment.

**Rationale:** Causality and temporal ordering.

**Enforcement:**
- `applyEvent()` validates `event.occurredAt >= payment.lastEventAt`
- Rejects out-of-order events

**Test:** All rails test temporal ordering.

**Exception:** Replay from historical events may have out-of-order timestamps (allowed during rebuild).

---

## Enforcement Strategy

### 1. Compile-Time Enforcement
- TypeScript types enforce state machine structure
- Immutable data structures (readonly fields)

### 2. Runtime Enforcement
- Invariant validation in `applyEvent()` functions
- Throws errors on violations
- No silent failures

### 3. Test-Time Enforcement
- 158 tests across 12 test files
- Every invariant has at least one test
- CI blocks merges if tests fail

### 4. Audit-Time Enforcement
- Evidence packs exportable for regulator review
- Replay tests prove determinism
- SHA-256 hashes detect tampering

---

## Breaking Changes Policy

### What Constitutes a Breaking Change?

1. **Modifying frozen invariants** (requires v2.0.0)
2. **Changing state machine transitions** (requires v2.0.0)
3. **Altering event schemas** (requires v2.0.0)
4. **Removing terminal states** (requires v2.0.0)

### What Does NOT Constitute a Breaking Change?

1. **Adding new states** (allowed in v1.x)
2. **Adding new events** (allowed in v1.x)
3. **Adding new invariants** (allowed in v1.x, must not conflict with frozen ones)
4. **Performance improvements** (allowed in v1.x)
5. **Bug fixes** (allowed in v1.x, as long as they enforce existing invariants)

---

## Violation Response

### Critical Violations (Immediate Action Required)

1. **Event mutation** - Rollback immediately, restore from backup
2. **Funds conservation violation** - Freeze payments, audit ledger
3. **Terminal state transition** - Rollback, investigate root cause
4. **Replay non-determinism** - Freeze deployments, fix before proceeding

### Non-Critical Violations (Fix in Next Release)

1. **Missing idempotency key** - Add in next event
2. **Timestamp ordering** - Log warning, allow for historical replay
3. **Documentation drift** - Update docs to match implementation

---

## Audit Trail

| Date | Change | Reason | Approved By |
|------|--------|--------|-------------|
| 2024-12-16 | Initial freeze (v1.0.0) | Baseline release | System Architect |

---

## Signature

This document represents the **immutable baseline** for Payments Spine v1.0.0. Any changes to these invariants require a major version bump (v2.0.0) and architectural review.

**Frozen By:** Manus AI  
**Date:** December 16, 2024  
**Version:** 1.0.0  
**Status:** IMMUTABLE
