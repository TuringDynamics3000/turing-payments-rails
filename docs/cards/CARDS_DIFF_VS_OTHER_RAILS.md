# Cards Rail Diff vs NPP/BECS/RTGS

## Executive Summary

Cards is fundamentally different from other payment rails because **auth ≠ settlement** and **settlement is reversible**. This document explains what makes Cards unique and why treating it like "slow NPP" will fail.

---

## Mental Model Shift

| Concept | NPP/BECS/RTGS | Cards |
|---------|---------------|-------|
| **Authorisation** | Immediate debit | Hold only (NOT posted to ledger) |
| **Settlement** | Final | Provisional (reversible via chargeback) |
| **Timeline** | Minutes to days | Months (chargebacks up to 120 days) |
| **Partial completion** | Not applicable | Partial capture allowed |
| **Reversal** | Rare (ops intervention) | Common (customer disputes) |

**Critical:** If devs think "SETTLED = final", you will fail.

---

## State Machine Differences

### NPP: Simple Linear Flow
```
CREATED → AUTHORISED → SENT → ACKNOWLEDGED → SETTLED
                     ↓
                  FAILED
```

### BECS: Batch + Delayed Truth
```
CREATED → AUTHORISED → BATCHED → SUBMITTED → CLEARED → SETTLED
                                                       ↓
                                                   RETURNED
```

### RTGS: Approval-Heavy
```
CREATED → PENDING_APPROVAL → APPROVED → SENT → SETTLED
                           ↓
                       REJECTED
```

### Cards: Time-Separated Promises
```
CREATED → AUTHORISED → CAPTURED → CLEARED → SETTLED
        ↓              ↓                      ↓
     DECLINED      EXPIRED              CHARGEBACK → REPRESENTED → SETTLED
                                                    ↓
                                               WRITTEN_OFF
```

**Key Differences:**
1. **AUTHORISED ≠ money movement** (hold only)
2. **CAPTURED ≠ final** (merchant intent, not settlement)
3. **SETTLED → CHARGEBACK** (reversibility)
4. **CHARGEBACK → REPRESENTED → SETTLED** (dispute resolution)

---

## Economic Invariants: Cards vs Others

### NPP/BECS/RTGS: Settlement is Final
```typescript
// Once settled, funds are transferred (immutable)
assertSettlementFinal(state: PaymentState) {
  if (state === "SETTLED") {
    // No reversal possible
  }
}
```

### Cards: Settlement is Provisional
```typescript
// Settlement can be reversed via chargeback
assertSettlementProvisional(provisional: boolean) {
  if (!provisional) {
    throw new Error("Cards settlement must always be provisional");
  }
}

// Chargeback reverses ledger
assertChargebackReversesLedger(fundsReversed, settledAmount) {
  if (fundsReversed !== settledAmount) {
    throw new Error("Chargeback must reverse full settlement");
  }
}
```

---

## Partial Capture: Cards-Only Feature

### Other Rails: All-or-Nothing
```typescript
// NPP/BECS/RTGS: Authorised amount = settled amount
authorisedAmount === settledAmount
```

### Cards: Partial Capture Allowed
```typescript
// Hotels, fuel stations: capture < auth
assertCaptureAllowed(authorisedAmount, capturedSoFar, captureAmount) {
  if (capturedSoFar + captureAmount > authorisedAmount) {
    throw new Error("Capture exceeds auth");
  }
}

// Multiple captures allowed
captures: CaptureRecord[] = [
  { captureAmount: 100n, captureSequence: 1 },
  { captureAmount: 50n, captureSequence: 2 },
];
```

**Real-World Example:**
- Hotel authorises $500 (estimated stay)
- Guest checks out early
- Hotel captures $300 (actual cost)
- Remaining $200 hold released

---

## Long-Tail Timelines: Cards vs Others

| Rail | Timeline | Reason |
|------|----------|--------|
| **NPP** | Seconds to minutes | Real-time gross settlement |
| **BECS** | T+1 to T+3 days | Batch processing |
| **RTGS** | Minutes to hours | Approval workflows |
| **Cards** | **Up to 120 days** | Chargeback windows (Visa/MC rules) |

**Implication:** Cards replay tests must simulate 90-day gaps to prove deterministic state reconstruction.

---

## Ledger Posting: Critical Difference

### NPP/BECS/RTGS: Post at Settlement
```typescript
// Authorisation → immediate ledger debit
onAuthorised(event) {
  ledger.debit(event.amount);
  fundsEarmarked += event.amount;
}
```

### Cards: NEVER Post at Authorisation
```typescript
// Authorisation → hold only (NOT posted to ledger)
onAuthorised(event) {
  holdPlaced = event.holdPlaced; // Tracked separately
  // ❌ NO ledger.debit() here!
}

// Settlement → ledger posting (provisional)
onSettled(event) {
  ledger.debit(event.settledAmount); // Flagged provisional
  settledAmount = event.settledAmount;
}

// Chargeback → ledger reversal
onChargeback(event) {
  ledger.credit(event.fundsReversed); // Reverse settlement
  fundsReversed = event.fundsReversed;
}
```

**Why This Matters:**
- Posting at auth → double-counting when settled
- Not flagging settlement as provisional → chargeback breaks ledger

---

## Event Sourcing Differences

### NPP: Linear Event Stream
```typescript
events = [
  PaymentIntentCreated,
  PaymentAuthorised,
  PaymentSent,
  PaymentAcknowledged,
  PaymentSettled,
];
```

### Cards: Branching + Reversible
```typescript
events = [
  PaymentIntentCreated,
  PaymentAuthorised,
  PaymentCaptured,      // Can be partial
  PaymentCaptured,      // Second partial capture
  PaymentCleared,
  PaymentSettled,
  PaymentChargeback,    // Reverses settlement
  PaymentRepresented,   // Merchant disputes
  PaymentSettled,       // Won dispute, re-settled
];
```

**Key Insight:** Cards event streams can have **multiple settlements** (chargeback → representment → re-settlement).

---

## Replay Semantics

### NPP/BECS: Replay to SETTLED = Done
```typescript
const payment = rebuildFromEvents(events);
assert(payment.state === "SETTLED");
assert(payment.fundsTransferred > 0);
// ✅ Final state
```

### Cards: Replay to SETTLED ≠ Done
```typescript
const payment = rebuildFromEvents(events);
assert(payment.state === "SETTLED");
assert(payment.settledAmount > 0);
assert(payment.provisional === true); // ⚠️ Still reversible!

// 90 days later...
const chargeback = { type: "PaymentChargeback", ... };
const updated = applyCardsEvent(payment, chargeback);
assert(updated.state === "CHARGEBACK");
assert(updated.fundsReversed === payment.settledAmount);
// ✅ Ledger reversed
```

---

## CI/CD Guardrails: Cards-Specific

### Gate 1: Auth Hold Never Leaks to Ledger
```typescript
test("auth hold not posted to ledger", () => {
  const payment = createCardsPayment(intentEvent);
  const authed = applyCardsEvent(payment, authEvent);
  
  assert(authed.holdPlaced > 0); // Hold tracked
  assert(authed.settledAmount === 0); // NOT posted to ledger
});
```

### Gate 2: Capture Never Exceeds Auth
```typescript
test("capture exceeds auth blocked", () => {
  const payment = createCardsPayment(intentEvent);
  const authed = applyCardsEvent(payment, { authorisedAmount: 100n });
  
  expect(() => {
    assertCaptureAllowed(100n, 0n, 150n); // Attempting 150
  }).toThrow("Capture exceeds auth");
});
```

### Gate 3: Settlement Reversible
```typescript
test("chargeback reverses settlement", () => {
  const payment = rebuildFromEvents([...settledEvents]);
  const chargedBack = applyCardsEvent(payment, chargebackEvent);
  
  assert(chargedBack.state === "CHARGEBACK");
  assert(chargedBack.fundsReversed === payment.settledAmount);
});
```

### Gate 4: Long-Tail Replay
```typescript
test("90-day gap replay deterministic", () => {
  const events = [...settledEvents];
  const payment1 = rebuildFromEvents(events);
  
  // Simulate 90-day gap
  const chargebackEvent = {
    type: "PaymentChargeback",
    occurredAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    ...
  };
  
  const payment2 = applyCardsEvent(payment1, chargebackEvent);
  const payment3 = rebuildFromEvents([...events, chargebackEvent]);
  
  assert(getCardsPaymentHash(payment2) === getCardsPaymentHash(payment3));
});
```

---

## What Devs Must NOT Do

| ❌ Anti-Pattern | ✅ Correct Approach |
|----------------|-------------------|
| Post ledger at authorisation | Hold only, post at settlement |
| Assume settlement is final | Flag as provisional, handle chargebacks |
| Treat cards like "slow NPP" | Model time-separated promises |
| Auto-resolve chargebacks | Require evidence, manual review |
| Ignore partial capture | Support multiple captures |

---

## Summary: Cards vs Other Rails

| Aspect | NPP/BECS/RTGS | Cards |
|--------|---------------|-------|
| **Auth** | Immediate debit | Hold only |
| **Settlement** | Final | Provisional |
| **Reversal** | Rare (ops) | Common (customer disputes) |
| **Partial completion** | No | Yes (partial capture) |
| **Timeline** | Minutes to days | Up to 120 days |
| **Replay complexity** | Linear | Branching + reversible |
| **Ledger posting** | At auth | At settlement (provisional) |
| **Economic invariants** | Settlement final | Settlement reversible |

---

## Acceptance Criteria

Cards is done only when:

- ✅ Partial capture demonstrated
- ✅ Chargeback reverses ledger
- ✅ Representment restores settlement
- ✅ Replay deterministic after 90 days
- ✅ CI blocks illegal economics
- ✅ Evidence pack regulator-ready

---

## Why This Matters

**NPP proved async correctness.**  
**BECS proved delayed truth.**  
**RTGS proved approval workflows.**  
**Cards prove time-reversibility.**

If you pass Cards, you've proven the payments spine can handle:
- Time-separated promises
- Reversible settlement
- Long-tail timelines
- Partial completion
- Branching event streams

This is the foundation for all future payment rails.
