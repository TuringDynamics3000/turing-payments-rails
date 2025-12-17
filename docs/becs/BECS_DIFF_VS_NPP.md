# BECS Invariants — Diff vs NPP

**Mental Model:** NPP is async + real-time; BECS is batch + delayed truth.

---

## 1. Lifecycle DIFF (NPP → BECS)

### 1.1 State Machine Changes

**REMOVE (NPP-only):**
- `ACKNOWLEDGED` (no scheme ACK in BECS)

**ADD (BECS-only):**
- `BATCHED`
- `SUBMITTED`
- `CLEARED`
- `RETURNED`

### 1.2 BECS Lifecycle (Full)

```
CREATED
 → AUTHORISED
 → BATCHED
 → SUBMITTED
 → CLEARED
 → SETTLED
```

**Failure / Exception Paths:**
```
BATCHED   → FAILED        (file build error)
SUBMITTED → FAILED        (file rejected)
CLEARED   → RETURNED      (dishonour days later)
ANY       → EXPIRED
```

**Critical difference:**  
BECS failures can arrive days after apparent success.

---

## 2. State Transition Diff Table

### 2.1 Allowed Transitions (BECS)

| From        | To         | NPP | BECS |
|-------------|------------|-----|------|
| CREATED     | AUTHORISED | ✅  | ✅   |
| AUTHORISED  | SENT       | ✅  | ❌   |
| AUTHORISED  | BATCHED    | ❌  | ✅   |
| BATCHED     | SUBMITTED  | ❌  | ✅   |
| SUBMITTED   | CLEARED    | ❌  | ✅   |
| CLEARED     | SETTLED    | ❌  | ✅   |
| CLEARED     | RETURNED   | ❌  | ✅   |
| ANY         | FAILED     | ✅  | ✅   |
| ANY         | EXPIRED    | ✅  | ✅   |

---

## 3. Economic Truth DIFF

### 3.1 Funds Semantics

| Concept             | NPP          | BECS     |
|---------------------|--------------|----------|
| Hold timing         | Before SEND  | Before BATCH |
| Provisional success | ACKNOWLEDGED | CLEARED  |
| Finality            | SETTLED      | SETTLED  |
| Late failure        | Rare         | Expected |

**New BECS rule:**  
Funds may appear settled and still be returned.

---

## 4. Invariant DIFF Table

### 4.1 State Invariants

| Rule                  | NPP | BECS |
|-----------------------|-----|------|
| ACK ≠ settlement      | ✅  | ❌   |
| Batch existence       | ❌  | ✅   |
| File-level failure    | ❌  | ✅   |
| Item-level return     | ❌  | ✅   |
| Late reversal expected| ❌  | ✅   |

### 4.2 Economic Invariants

| Invariant                | BECS Rule |
|--------------------------|-----------|
| Single settlement        | Still enforced |
| Settlement not final     | Until return window closes |
| Return reverses ledger   | Mandatory |
| Batch totals reconcile   | Mandatory |

---

## 5. Ops & Control Surface DIFF

### 5.1 Ops Actions

| Action        | NPP  | BECS |
|---------------|------|------|
| Retry         | FAILED | FAILED / RETURNED |
| Cancel        | AUTHORISED | AUTHORISED / BATCHED |
| Re-submit     | ❌   | SUBMITTED (file resend) |
| Manual return | ❌   | CLEARED only |

---

## 6. BECS-Specific Invariants (Code-Level)

### 6.1 State Transition Matrix

```typescript
// core/payments/becs/BECSStateTransitions.ts

import { BECSPaymentState } from "./BECSPaymentState";

export const BECS_ALLOWED_TRANSITIONS: Record<
  BECSPaymentState,
  BECSPaymentState[]
> = {
  CREATED: ["AUTHORISED", "FAILED", "EXPIRED"],
  AUTHORISED: ["BATCHED", "FAILED", "EXPIRED"],
  BATCHED: ["SUBMITTED", "FAILED", "EXPIRED"],
  SUBMITTED: ["CLEARED", "FAILED", "EXPIRED"],
  CLEARED: ["SETTLED", "RETURNED"],
  RETURNED: [],
  SETTLED: [],
  FAILED: [],
  EXPIRED: [],
};
```

### 6.2 Batch Integrity Invariant

```typescript
// core/payments/becs/BECSInvariants.ts

import { BECSPaymentEvent } from "./BECSPaymentEvent";

export function assertBatchTotalsReconcile(
  batchEvents: BECSPaymentEvent[],
  declaredTotal: bigint
) {
  const items = batchEvents.filter(
    e => e.type === "PaymentBatched"
  );

  const batchTotal = items.reduce(
    (sum, e) => sum + (e.type === "PaymentBatched" ? e.fundsHeld : 0n),
    0n
  );

  if (batchTotal !== declaredTotal) {
    throw new Error(
      "INVARIANT_VIOLATION: batch total mismatch"
    );
  }
}
```

### 6.3 Return Handling Invariant

```typescript
// core/payments/becs/BECSInvariants.ts

import { BECSPaymentState } from "./BECSPaymentState";

export function assertReturnOnlyFromCleared(
  state: BECSPaymentState
) {
  if (state !== BECSPaymentState.CLEARED) {
    throw new Error(
      "INVARIANT_VIOLATION: return only allowed from CLEARED"
    );
  }
}
```

---

## 7. Evidence Pack DIFF

**Additional Required Fields (BECS):**

```json
{
  "batch_id": "string",
  "batch_date": "YYYY-MM-DD",
  "file_reference": "string",
  "return_code": "string | null",
  "return_date": "YYYY-MM-DD | null"
}
```

---

## 8. Replay Semantics DIFF

| Scenario                | Expected |
|-------------------------|----------|
| Replay before return    | CLEARED  |
| Replay after return     | RETURNED |
| Replay after settlement | SETTLED  |
| Return after settlement | FAIL CI  |

---

## 9. CI Additions (BECS vs NPP)

**Mandatory New Tests:**

1. Batch reconciliation test
2. Late return replay test
3. File rejection test
4. Partial batch failure test

---

## 10. What Devs Must NOT Do

❌ Treat BECS like "slow NPP"  
❌ Skip batch-level events  
❌ Assume settlement is final  
❌ Merge BECS without replay tests

---

## 11. Acceptance Gate (BECS Stage Complete)

BECS is done only when:

- ✅ Batch totals reconcile
- ✅ Late returns reverse ledger
- ✅ Ops can resubmit safely
- ✅ Replay reproduces final state
- ✅ CI blocks illegal return paths

---

## 12. Why This Diff Matters

If you don't encode these differences:

- Your ledger will drift
- Ops will lose trust
- Regulators will find it

---

## Implementation Checklist

### Core Components

- [x] `BECSPaymentState.ts` - State machine (9 states)
- [x] `BECSStateTransitions.ts` - Legal transition matrix
- [x] `BECSPaymentEvent.ts` - Event types (10 events)
- [x] `BECSInvariants.ts` - Invariant enforcement (5 categories)
- [x] `BECSPayment.ts` - Immutable aggregate
- [x] `index.ts` - Public API

### Tests (To Be Implemented)

- [ ] Invariant tests (batch reconciliation, return handling)
- [ ] Replay tests (deterministic state reconstruction)
- [ ] Late return tests (CLEARED → RETURNED)
- [ ] File rejection tests (SUBMITTED → FAILED)
- [ ] Partial batch failure tests

### Documentation

- [x] BECS diff vs NPP
- [ ] BECS architecture diagrams
- [ ] BECS operator runbook

---

**Next Steps:**

1. Write BECS tests (batch reconciliation, late returns, replay)
2. Create BECS evidence pack builder
3. Extend CI/CD guardrails for BECS
4. Load test BECS batch processing

---

*Generated: 2025-12-17*  
*Status: Core Implementation Complete*
