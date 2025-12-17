# Payments Spine v1.0.0 - Baseline Contract

**Status:** IMMUTABLE  
**Date:** December 16, 2024  
**Scope:** Core architecture and design principles

---

## Purpose

This document defines **what will NEVER change** in the Payments Spine architecture. These are the foundational principles that all future development MUST respect. Violating this contract requires a new major version (v2.0.0+) and constitutes a complete architectural redesign.

---

## 1. Event Sourcing is Non-Negotiable

### Contract
**All payment state changes MUST be captured as immutable events in an append-only event stream.**

### What This Means
- Payment state is NEVER updated in-place
- All state transitions produce events
- Events are the single source of truth
- Current state is derived from event replay

### What Will NEVER Change
- ✅ Events are immutable (no UPDATE/DELETE)
- ✅ State is derived, not stored
- ✅ Replay is deterministic
- ✅ Events have `occurredAt` timestamps

### What CAN Change
- ❌ Event store implementation (PostgreSQL, EventStore DB, etc.)
- ❌ Event serialization format (JSON, Protobuf, Avro)
- ❌ Snapshot strategies (performance optimization)

### Why This is Immutable
Event sourcing enables:
- Audit trails for regulators
- Time-travel queries (state at any point in time)
- Crash recovery without data loss
- Deterministic testing and replay

**Breaking this contract would destroy the entire architecture.**

---

## 2. State Machines Define Legal Transitions

### Contract
**Every payment rail MUST have an explicit state machine defining legal state transitions.**

### What This Means
- States are enumerated (CREATED, AUTHORISED, SETTLED, etc.)
- Transitions are explicitly defined in a matrix
- Illegal transitions are rejected at runtime
- State machines are documented and frozen

### What Will NEVER Change
- ✅ State machines exist for all rails
- ✅ Transitions are validated before applying
- ✅ Terminal states are immutable
- ✅ State transition matrix is explicit

### What CAN Change
- ❌ New states can be added (non-breaking)
- ❌ New transitions can be added (with approval)
- ❌ State names can be aliased (for clarity)

### Why This is Immutable
State machines provide:
- Predictable behavior
- Compile-time safety
- Clear documentation
- Regulatory compliance

**Without state machines, payments become unpredictable.**

---

## 3. Invariants are Enforced, Not Documented

### Contract
**Economic and temporal invariants MUST be enforced in code, not just documented.**

### What This Means
- Funds conservation is validated on every event
- Illegal state transitions throw errors
- Terminal states reject new events
- Idempotency is enforced

### What Will NEVER Change
- ✅ Invariants are runtime-enforced
- ✅ Violations throw errors (no silent failures)
- ✅ Tests verify invariant enforcement
- ✅ CI blocks merges if invariants fail

### What CAN Change
- ❌ New invariants can be added
- ❌ Invariant error messages can improve
- ❌ Performance optimizations (as long as invariants hold)

### Why This is Immutable
Enforcement prevents:
- Balance drift
- Fraud
- Regulatory violations
- Data corruption

**Documentation without enforcement is worthless.**

---

## 4. No Stored Balances

### Contract
**Payment state MUST NOT store account balances. Balances are derived from ledger postings.**

### What This Means
- Payment state contains only payment-specific data
- Balances are queried from the ledger
- Ledger is the single source of truth for balances
- Payment state tracks `fundsEarmarked`, `fundsTransferred`, `fundsReversed` (not balances)

### What Will NEVER Change
- ✅ No `accountBalance` field in payment state
- ✅ Balances derived from ledger
- ✅ Ledger is append-only
- ✅ Double-entry bookkeeping enforced

### What CAN Change
- ❌ Ledger implementation (SQL, NoSQL, etc.)
- ❌ Balance caching strategies
- ❌ Read model optimizations

### Why This is Immutable
Storing balances causes:
- Balance drift (out of sync with ledger)
- Concurrency bugs
- Audit trail gaps
- Regulatory violations

**Balances MUST be derived, never stored.**

---

## 5. Evidence Packs are Regulator-Ready

### Contract
**Every payment MUST be exportable as a complete, self-contained evidence pack for audit.**

### What This Means
- Evidence packs include all events
- Evidence packs include replay proof (SHA-256 hash)
- Evidence packs include timeline metadata
- Evidence packs are human-readable and machine-verifiable

### What Will NEVER Change
- ✅ Evidence packs exist for all rails
- ✅ Evidence packs include replay proof
- ✅ Evidence packs are exportable
- ✅ Evidence packs are immutable

### What CAN Change
- ❌ Evidence pack format (JSON, PDF, XML)
- ❌ Evidence pack schema (add fields, never remove)
- ❌ Export mechanisms (API, batch, streaming)

### Why This is Immutable
Regulators require:
- Complete audit trails
- Tamper detection
- Timeline reconstruction
- Evidence of compliance

**Without evidence packs, we cannot operate legally.**

---

## 6. Replay is Deterministic

### Contract
**Replaying the same events in the same order MUST produce identical state, every time.**

### What This Means
- No external dependencies in state transitions
- No random number generation
- No current time lookups (use event timestamps)
- SHA-256 hash verification before/after replay

### What Will NEVER Change
- ✅ Replay is deterministic
- ✅ Hash verification enforced
- ✅ No side effects in `applyEvent()`
- ✅ Events contain all necessary data

### What CAN Change
- ❌ Replay performance optimizations
- ❌ Snapshot strategies
- ❌ Parallel replay (as long as determinism holds)

### Why This is Immutable
Deterministic replay enables:
- Crash recovery
- Temporal queries
- Audit trail verification
- Testing and debugging

**Non-deterministic replay breaks event sourcing.**

---

## 7. Terminal States are Final

### Contract
**Once a payment reaches a terminal state (SETTLED, FAILED, WRITTEN_OFF), it MUST NOT transition to any other state.**

### What This Means
- SETTLED is final (except Cards chargebacks)
- FAILED is final
- WRITTEN_OFF is final
- Terminal states have no outbound transitions

### What Will NEVER Change
- ✅ Terminal states exist
- ✅ Terminal states reject new events
- ✅ Settlement finality enforced
- ✅ Tests verify terminal state immutability

### What CAN Change
- ❌ New terminal states can be added
- ❌ Terminal state names can change (with migration)

### Why This is Immutable
Settlement finality is required for:
- Regulatory compliance
- Accounting close
- Reconciliation
- Dispute resolution

**Exception:** Cards CHARGEBACK can reverse SETTLED (time-reversibility by design).

---

## 8. Operator Actions are Policy-Gated

### Contract
**All operator actions (retry, cancel, manual settlement) MUST require policy approval before execution.**

### What This Means
- Operators cannot act unilaterally
- Policy engine evaluates authorization
- Actions are logged in evidence packs
- Unauthorized actions are rejected

### What Will NEVER Change
- ✅ Policy-gated authorization required
- ✅ Operator actions logged
- ✅ Unauthorized actions rejected
- ✅ Evidence packs include ops actions

### What CAN Change
- ❌ Policy rules (configurable)
- ❌ Authorization mechanisms (RBAC, ABAC, etc.)
- ❌ Operator UI/UX

### Why This is Immutable
Policy gating prevents:
- Fraud
- Unauthorized settlements
- Regulatory violations
- Audit trail gaps

**Operators MUST be constrained by policy.**

---

## 9. Rails are Isolated

### Contract
**Payment rails MUST NOT share state or cross-import code.**

### What This Means
- NPP, BECS, RTGS, Cards are independent modules
- No `import` statements across rails
- Shared utilities in `core/` only
- Each rail has its own state machine

### What Will NEVER Change
- ✅ Rails are isolated
- ✅ No cross-rail imports
- ✅ Shared code in `core/` only
- ✅ CI enforces isolation

### What CAN Change
- ❌ New rails can be added
- ❌ Shared utilities can be extracted
- ❌ Rail-specific optimizations

### Why This is Immutable
Isolation enables:
- Independent deployment
- Parallel development
- Failure isolation
- Regulatory separation (different rails, different regulators)

**Cross-rail dependencies create cascading failures.**

---

## 10. Time-Reversibility (Cards Only)

### Contract
**Cards rail MUST support time-reversibility (chargebacks can reverse settled payments).**

### What This Means
- SETTLED → CHARGEBACK transition allowed
- Settlement is provisional, not final
- Chargeback window is 30-120 days
- Funds reversal is tracked

### What Will NEVER Change
- ✅ Cards support chargebacks
- ✅ SETTLED is provisional
- ✅ Chargeback reverses funds
- ✅ Evidence packs include chargeback metadata

### What CAN Change
- ❌ Chargeback window duration (regulatory change)
- ❌ Representment flows
- ❌ Chargeback reason codes

### Why This is Immutable
Card schemes (Visa, Mastercard) require:
- Consumer protection
- Dispute resolution
- Chargeback rights

**Cards without chargebacks violate scheme rules.**

---

## 11. No Business Logic in Events

### Contract
**Events MUST be pure data. No business logic, no validation, no side effects.**

### What This Means
- Events are immutable data structures
- Events contain `type`, `occurredAt`, and payload
- No methods on event objects
- Validation happens in `applyEvent()`, not in events

### What Will NEVER Change
- ✅ Events are data-only
- ✅ No methods on events
- ✅ No validation in events
- ✅ Events are serializable

### What CAN Change
- ❌ Event schema (add fields, never remove)
- ❌ Event serialization format

### Why This is Immutable
Pure data events enable:
- Serialization (JSON, Protobuf, etc.)
- Storage in any database
- Cross-language compatibility
- Replay from historical data

**Business logic in events breaks serialization.**

---

## 12. Idempotency is Mandatory

### Contract
**Applying the same event multiple times MUST produce the same result as applying it once.**

### What This Means
- Events include `idempotencyKey` or sequence numbers
- Duplicate detection in `applyEvent()`
- Safe retries and at-least-once delivery
- No side effects from duplicate events

### What Will NEVER Change
- ✅ Idempotency enforced
- ✅ Duplicate events detected
- ✅ Safe retries guaranteed
- ✅ Tests verify idempotency

### What CAN Change
- ❌ Idempotency key generation strategy
- ❌ Duplicate detection mechanism

### Why This is Immutable
Idempotency enables:
- At-least-once delivery
- Safe retries
- Network failure recovery
- Distributed systems

**Without idempotency, retries corrupt state.**

---

## What CAN Change (Non-Breaking)

The following changes are **allowed in v1.x releases** and do NOT violate the baseline contract:

### 1. New States
- Adding new states to state machines (e.g., PENDING_REVIEW)
- As long as existing states remain

### 2. New Events
- Adding new event types (e.g., PaymentSuspended)
- As long as existing events remain

### 3. New Invariants
- Adding stricter invariants (e.g., max payment amount)
- As long as they don't conflict with frozen invariants

### 4. Performance Optimizations
- Snapshots for faster replay
- Caching strategies
- Index optimizations
- As long as determinism holds

### 5. New Rails
- Adding new payment rails (e.g., SWIFT, ACH)
- As long as they follow the baseline contract

### 6. UI/UX Improvements
- Operator dashboards
- Evidence pack viewers
- Timeline visualizations

### 7. Integration Points
- New APIs
- New export formats
- New notification channels

---

## What CANNOT Change (Breaking)

The following changes **require v2.0.0** and constitute a complete redesign:

### 1. Abandoning Event Sourcing
- Switching to CRUD (Create, Read, Update, Delete)
- Storing state instead of events
- Mutable state updates

### 2. Removing State Machines
- Ad-hoc state transitions
- Implicit state management
- No validation

### 3. Storing Balances
- Adding `accountBalance` to payment state
- Querying balances from payment state
- Abandoning ledger as source of truth

### 4. Non-Deterministic Replay
- External dependencies in `applyEvent()`
- Random number generation
- Current time lookups

### 5. Mutable Terminal States
- Allowing transitions from SETTLED
- Modifying FAILED payments
- Reopening WRITTEN_OFF payments

### 6. Cross-Rail Dependencies
- Importing NPP code in BECS
- Shared state between rails
- Coupled deployments

---

## Enforcement

### Compile-Time
- TypeScript types enforce immutability
- State machine types prevent illegal transitions
- No cross-rail imports (linter rules)

### Runtime
- Invariant validation in `applyEvent()`
- Terminal state enforcement
- Idempotency checks

### Test-Time
- 158 tests across 12 test files
- Every contract principle has tests
- CI blocks merges if tests fail

### Audit-Time
- Evidence packs exportable
- Replay tests prove determinism
- SHA-256 hashes detect tampering

---

## Signature

This document represents the **immutable foundation** of the Payments Spine. Any violation of this contract is a **critical architectural failure** that must be escalated immediately.

**Frozen By:** Manus AI  
**Date:** December 16, 2024  
**Version:** 1.0.0  
**Status:** IMMUTABLE

---

## Appendix: Why These Principles?

### Event Sourcing
- **Audit trails:** Regulators require complete history
- **Time travel:** Query state at any point in time
- **Crash recovery:** Rebuild state from events

### State Machines
- **Predictability:** Clear, documented behavior
- **Safety:** Illegal transitions rejected
- **Compliance:** Regulatory requirements

### Invariant Enforcement
- **Correctness:** Funds conservation guaranteed
- **Fraud prevention:** Violations detected immediately
- **Testing:** Invariants are testable

### No Stored Balances
- **Single source of truth:** Ledger is authoritative
- **No drift:** Balances always correct
- **Audit trail:** All changes logged

### Evidence Packs
- **Regulatory compliance:** Required for audit
- **Tamper detection:** SHA-256 hashes
- **Dispute resolution:** Complete timeline

### Deterministic Replay
- **Testing:** Reproducible behavior
- **Debugging:** Replay production issues
- **Verification:** Prove correctness

### Terminal States
- **Settlement finality:** Required for accounting
- **Regulatory compliance:** Immutable records
- **Dispute resolution:** Clear outcomes

### Policy-Gated Actions
- **Fraud prevention:** Unauthorized actions blocked
- **Audit trail:** All actions logged
- **Compliance:** Authorization required

### Rail Isolation
- **Failure isolation:** One rail fails, others continue
- **Independent deployment:** Deploy rails separately
- **Regulatory separation:** Different regulators

### Time-Reversibility (Cards)
- **Consumer protection:** Chargeback rights
- **Scheme compliance:** Visa/Mastercard rules
- **Dispute resolution:** Reverse fraudulent charges

### Pure Data Events
- **Serialization:** Store in any database
- **Cross-language:** Use from any platform
- **Replay:** Reconstruct state from data

### Idempotency
- **At-least-once delivery:** Safe retries
- **Network failures:** Recover gracefully
- **Distributed systems:** Eventual consistency

---

**This is the foundation. Build on it, but never break it.**
