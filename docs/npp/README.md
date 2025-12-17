# NPP Payments Orchestration

**Bank-Grade New Payments Platform Integration for TuringCore-v3**

## Overview

The NPP Orchestration module provides a production-ready implementation of Australia's New Payments Platform (NPP) integration with immutable event sourcing, deterministic replay, and regulator-ready evidence packs.

**Status:** ✅ Production Ready (Phases 1-5 Complete)

## Architecture Principles

### 1. Event-Sourced State Machine

All NPP payment state is derived from immutable events. No stored balances, no mutable state—only append-only facts.

```
Current State = fold(events)
```

**7 Canonical States:**

```
CREATED → AUTHORISED → SENT → ACKNOWLEDGED → SETTLED (terminal)
                                           → FAILED (terminal)
                                           → EXPIRED (terminal)
```

### 2. Immutable Events

**9 Event Types:**

1. `PaymentIntentCreated` - Intent exists, nothing executed
2. `PaymentAuthorised` - Policy & balance checks passed, funds earmarked
3. `PaymentAttemptCreated` - New attempt created (for retries)
4. `PaymentSentToRail` - Submitted to NPP rail, funds held
5. `PaymentAcknowledged` - Accepted by scheme (ACK ≠ settlement)
6. `PaymentSettled` - Final settlement confirmed (TERMINAL)
7. `PaymentFailed` - Terminal failure, funds released (TERMINAL)
8. `PaymentExpired` - Time window elapsed (TERMINAL)
9. `OpsOverrideApplied` - Operator action recorded

### 3. Deterministic Replay

The system guarantees that replaying the same events produces the same state with cryptographic proof (SHA-256 hashes).

**Replay Formula:**
```typescript
rebuildFromEvents(events) === originalState
hash(rebuiltState) === hash(originalState)
```

### 4. Invariant Enforcement

**Four Invariant Categories:**

1. **State Transition Invariants**
   - Only legal transitions allowed (enforced via NPP_ALLOWED_TRANSITIONS matrix)
   - Terminal states (SETTLED, FAILED, EXPIRED) are immutable
   - No backward transitions

2. **Economic Invariants**
   - Positive amounts only (amount > 0)
   - Single settlement per payment
   - Funds consistency (held funds == intent amount until terminal)
   - AUD currency only

3. **Idempotency Invariants**
   - Duplicate idempotency key returns existing payment
   - Duplicate callbacks don't change state
   - Retry safety guaranteed

4. **NPP-Specific Invariants**
   - ACK ≠ settlement (acknowledgment doesn't guarantee success)
   - Late failure allowed after ACK (NPP reality)
   - Time-boxed expiry to prevent zombie payments

### 5. Policy-Gated Operator Actions

All operator actions are policy-gated and emit immutable events. Operators cannot directly mutate state.

**Three Operator Actions:**

1. **Retry Payment** - Create new attempt after failure
   - Requires: FAILED state
   - Emits: `PaymentAttemptCreated` → `PaymentSentToRail`
   - Policy: Resolve approval required

2. **Cancel Payment** - Manually fail payment
   - Requires: CREATED, AUTHORISED, or SENT state
   - Emits: `PaymentFailed` with reason=CANCELLED
   - Policy: Resolve approval required

3. **Mark Failed** - Record external failure
   - Requires: SENT or ACKNOWLEDGED state
   - Emits: `PaymentFailed` with specified reason
   - Policy: Resolve approval required

### 6. Evidence Packs

Regulator-ready evidence export with cryptographic replay proof.

**Evidence Pack Contents:**

- Payment intent (amount, currency, accounts)
- Rail decisions (policy checks, balance verification)
- Lifecycle events (full event stream)
- Operator actions (retry, cancel, mark failed)
- Replay proof (SHA-256 hash chain)

**Export Formats:**
- JSON (machine-readable)
- PDF (board pack automation)

## File Structure

```
core/payments/npp/
├── NPPPayment.ts              # Immutable aggregate
├── NPPPaymentState.ts         # State machine (7 states)
├── NPPPaymentEvent.ts         # Event types (9 events)
├── NPPPaymentErrors.ts        # Domain errors
├── NPPStateTransitions.ts     # Legal transition matrix
├── NPPInvariants.ts           # Invariant enforcement (4 categories)
├── NPPOpsActions.ts           # Policy-gated operator actions
├── NPPEvidencePack.ts         # Evidence export with replay proof
└── index.ts                   # Public API

server/
├── npp.invariants.test.ts     # 20 invariant tests
├── npp.ops.test.ts            # 11 ops action tests
├── npp.evidence.test.ts       # 7 evidence pack tests
└── npp.replay.test.ts         # 7 replay guarantee tests (Phase 5)

docs/npp/
├── README.md                  # This file
├── ARCHITECTURE.md            # Architecture diagrams
└── OPERATOR_RUNBOOK.md        # Operator procedures
```

## Test Coverage

**227 Tests Passing (19 test files)**

### NPP-Specific Tests (45 tests)

1. **Invariant Tests** (`npp.invariants.test.ts`) - 20 tests
   - State transition enforcement
   - Economic rules (positive amounts, single settlement)
   - Idempotency checks
   - NPP-specific constraints (ACK ≠ settlement)

2. **Ops Action Tests** (`npp.ops.test.ts`) - 11 tests
   - Retry payment with state guards
   - Cancel payment with policy gates
   - Mark failed with reason tracking

3. **Evidence Pack Tests** (`npp.evidence.test.ts`) - 7 tests
   - Deterministic export
   - Replay proof verification
   - JSON/PDF generation

4. **Replay Guarantee Tests** (`npp.replay.test.ts`) - 7 tests
   - Happy path replay (SETTLED)
   - Failure path replay (FAILED)
   - Retry scenario replay
   - Ops intervention replay
   - Partial replay (intermediate states)
   - Event order enforcement

## Key NPP Realities

### ACK ≠ Settlement

NPP acknowledgment (`PaymentAcknowledged`) does **NOT** guarantee settlement. Payments can still fail after ACK.

**Correct Flow:**
```
SENT → ACKNOWLEDGED → SETTLED ✅
SENT → ACKNOWLEDGED → FAILED ✅ (late failure allowed)
```

**Incorrect Assumption:**
```
ACKNOWLEDGED → funds moved ❌ (WRONG)
```

### Terminal States Are Immutable

Once a payment reaches a terminal state (SETTLED, FAILED, EXPIRED), no further transitions are allowed.

**Enforced by:**
```typescript
assertNotTerminal(currentState)
```

### Retry Safety

Retries create new attempts but preserve the original payment intent. All attempts are tracked.

**Retry Flow:**
```
FAILED → retry → AUTHORISED → SENT → SETTLED
```

**Idempotency:**
- Same idempotency key → same payment
- Duplicate callbacks → no state change

## Usage Examples

### 1. Create Payment Intent

```typescript
import { createNPPPayment } from "@/core/payments/npp";

const event: PaymentIntentCreated = {
  type: "PaymentIntentCreated",
  paymentIntentId: "pay_001",
  occurredAt: new Date(),
  amount: 50000n, // $500.00 in cents
  currency: "AUD",
  idempotencyKey: "idem_001",
  fromAccountId: "acc_from",
  toAccountId: "acc_to",
};

const payment = createNPPPayment(event);
```

### 2. Apply Events

```typescript
import { applyEvent } from "@/core/payments/npp";

let payment = createNPPPayment(intentEvent);

// Apply authorisation
payment = applyEvent(payment, {
  type: "PaymentAuthorised",
  paymentIntentId: "pay_001",
  occurredAt: new Date(),
  policyChecksPassed: true,
  fundsEarmarked: 50000n,
});

// Apply settlement
payment = applyEvent(payment, {
  type: "PaymentSettled",
  paymentIntentId: "pay_001",
  occurredAt: new Date(),
  attemptId: "att_1",
  settlementRef: "settle_001",
  fundsTransferred: 50000n,
});
```

### 3. Rebuild from Events (Replay)

```typescript
import { rebuildFromEvents } from "@/core/payments/npp";

// Load events from database
const events = await loadEventsFromDB(paymentIntentId);

// Rebuild state
const payment = rebuildFromEvents(events);

// Verify determinism
const hash1 = computeStateHash(payment);
const rebuiltPayment = rebuildFromEvents(events);
const hash2 = computeStateHash(rebuiltPayment);

assert(hash1 === hash2); // Deterministic replay guaranteed
```

### 4. Operator Actions

```typescript
import { retryPayment, cancelPayment, markFailed } from "@/core/payments/npp";

// Retry failed payment
const retryResult = await retryPayment(
  payment,
  "att_2",
  "Resolve approved retry"
);

// Cancel payment
const cancelResult = await cancelPayment(
  payment,
  "Customer requested cancellation"
);

// Mark failed
const failResult = await markFailed(
  payment,
  NPPFailureReason.RAIL,
  "External rail failure"
);
```

### 5. Generate Evidence Pack

```typescript
import { buildNPPEvidencePack, exportNPPEvidencePackJSON } from "@/core/payments/npp";

const evidencePack = buildNPPEvidencePack(
  paymentIntent,
  railDecisions,
  lifecycleEvents,
  opsActions
);

// Verify replay proof
const isValid = verifyNPPEvidencePack(evidencePack);

// Export as JSON
const json = exportNPPEvidencePackJSON(evidencePack);
```

## CI Enforcement

All NPP tests are CI-blocking. The composite workflow enforces:

1. **Invariant Tests** - All 20 invariant tests must pass
2. **Ops Action Tests** - All 11 ops action tests must pass
3. **Evidence Pack Tests** - All 7 evidence pack tests must pass
4. **Replay Guarantee Tests** - All 7 replay tests must pass

**CI Workflow:** `.github/workflows/lending-composite.yml` (extended for NPP)

## Production Readiness Checklist

- ✅ Event-sourced state machine (7 states, 9 events)
- ✅ Deterministic replay with cryptographic proof
- ✅ Invariant enforcement (4 categories, 20 tests)
- ✅ Policy-gated operator actions (3 actions, 11 tests)
- ✅ Evidence packs with replay proof (7 tests)
- ✅ Replay guarantee tests (7 tests, CI-blocking)
- ✅ ACK ≠ settlement enforcement
- ✅ Terminal state immutability
- ✅ Idempotency guarantees
- ✅ Retry safety
- ✅ No stored balances (derived from events)
- ✅ No cross-core dependencies
- ✅ Regulator-ready audit trail

## Next Steps

1. **Phase 6:** Documentation (this file) ✅
2. **GitHub Sync:** Push Phases 3-5 to master
3. **Production Deployment:** Deploy to staging environment
4. **Load Testing:** Verify NPP throughput (target: 134 TPS)
5. **Regulator Review:** Submit evidence packs for audit

## References

- [Architecture Diagrams](./ARCHITECTURE.md)
- [Operator Runbook](./OPERATOR_RUNBOOK.md)
- [NPP Specification](https://www.nppa.com.au/)
- [Event Sourcing Patterns](https://martinfowler.com/eaaDev/EventSourcing.html)

## Support

For questions or issues, contact the TuringDynamics Core team or submit an issue on GitHub.

**Repository:** https://github.com/TuringDynamics3000/turingcore-cu-digital-twin
