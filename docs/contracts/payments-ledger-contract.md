# Payments ↔ Ledger Event & Schema Contract

**turing-payments-rails ⇄ TuringCore-v3**

## 0. Contract Principles (Non-Negotiable)

### Single Source of Truth

- **Payments Rails** = lifecycle + decision truth
- **TuringCore-v3** = economic / ledger truth

### Event-first

- Python never queries Rails for "current state"
- Python consumes immutable events and derives state

### Append-only

- No event mutation
- Corrections are new events

### Replayable

- Replaying events MUST recreate the same ledger outcome

### Idempotent

- Duplicate events MUST be safely ignored

## 1. Transport & Envelope (Shared)

### 1.1 Transport

- **Primary:** Webhook / Event bus (at-least-once)
- **Ordering guarantee:** per `payment_id`
- **Delivery guarantee:** at-least-once

### 1.2 Canonical Event Envelope (Required)

All events from turing-payments-rails MUST use this envelope.

```json
{
  "event_id": "uuid",
  "event_type": "string",
  "event_version": 1,
  "occurred_at": "ISO-8601",
  "producer": "turing-payments-rails",
  "correlation_id": "uuid",
  "causation_id": "uuid | null",

  "entity_type": "PAYMENT",
  "entity_id": "payment_id",

  "payload": { }
}
```

**Field rules:**

- `event_id` → globally unique
- `correlation_id` → constant across lifecycle
- `causation_id` → previous event that triggered this one
- `entity_id` → immutable payment identifier

## 2. Canonical Identifiers (Shared Vocabulary)

| Field | Meaning |
|-------|---------|
| `payment_id` | Unique payment lifecycle |
| `attempt_id` | One execution attempt |
| `external_ref` | Rail / processor reference |
| `ledger_account_id` | Target account in TuringCore |
| `rail` | NPP \| BECS \| RTGS \| CARDS |

## 3. Event Types Emitted by Payments Rails

### 3.1 Lifecycle Events (Authoritative)

#### PaymentInitiated

```json
{
  "payment_id": "string",
  "rail": "NPP | BECS | RTGS | CARDS",
  "amount": 123.45,
  "currency": "AUD",
  "source_account_id": "string",
  "destination": {
    "type": "ACCOUNT | PAYID | CARD",
    "value": "string"
  }
}
```

**Ledger action:** ❌ NONE (no posting)

#### PaymentAttemptCreated

```json
{
  "payment_id": "string",
  "attempt_id": "string",
  "rail": "string"
}
```

**Ledger action:** ❌ NONE

#### PaymentSent

```json
{
  "payment_id": "string",
  "attempt_id": "string",
  "external_ref": "string"
}
```

**Ledger action:** ❌ NONE (optional hold logic only if ledger supports it)

#### PaymentAcknowledged (NPP only)

```json
{
  "payment_id": "string",
  "attempt_id": "string"
}
```

**Ledger action:** ❌ NONE (ACK ≠ settlement)

### 3.2 Settlement & Economic Events (Critical)

#### PaymentSettled

```json
{
  "payment_id": "string",
  "attempt_id": "string",
  "external_ref": "string",
  "settled_at": "ISO-8601",
  "ledger_posting": {
    "debit_account_id": "string",
    "credit_account_id": "string",
    "amount": 123.45
  }
}
```

**Ledger action:** ✅ POST LEDGER ENTRY (idempotent, once only)

#### PaymentFailed

```json
{
  "payment_id": "string",
  "attempt_id": "string | null",
  "failure_code": "string",
  "failure_reason": "string"
}
```

**Ledger action:** ❌ NONE (or release holds if applicable)

#### PaymentExpired

```json
{
  "payment_id": "string",
  "expired_at": "ISO-8601"
}
```

**Ledger action:** ❌ NONE

### 3.3 Reversal / Correction Events

#### PaymentReversed

```json
{
  "payment_id": "string",
  "original_settlement_event_id": "uuid",
  "reversed_at": "ISO-8601",
  "ledger_posting": {
    "debit_account_id": "string",
    "credit_account_id": "string",
    "amount": 123.45
  }
}
```

**Ledger action:** ✅ POST REVERSAL ENTRY (must reference original posting)

### 3.4 Cards-specific Events

#### CardAuthorised

```json
{
  "payment_id": "string",
  "auth_code": "string",
  "amount": 123.45,
  "expires_at": "ISO-8601"
}
```

**Ledger action:** ❌ NONE (holds optional, non-posting)

#### CardCaptured

```json
{
  "payment_id": "string",
  "capture_amount": 50.00
}
```

**Ledger action:** ❌ NONE

#### CardChargebackReceived

```json
{
  "payment_id": "string",
  "reason_code": "string",
  "received_at": "ISO-8601"
}
```

**Ledger action:** ✅ REVERSE PRIOR SETTLEMENT (or mark provisional loss)

## 4. Ledger (TuringCore-v3) Obligations

### 4.1 Idempotency Rules

- `event_id` MUST be persisted
- Reprocessing same `event_id` MUST be a no-op

### 4.2 Posting Rules

Ledger entries ONLY occur on:

- `PaymentSettled`
- `PaymentReversed`
- `CardChargebackReceived`

**Any other posting = contract violation**

### 4.3 Replay Rule (Hard)

Replaying all events for a `payment_id` MUST recreate identical ledger balances.

**Failure = bug**

## 5. What Rails Must NEVER Do

Payments Rails MUST NOT:

- calculate balances
- post ledger entries
- mutate historical events
- assume settlement finality (cards / BECS)

## 6. Schema Versioning

- `event_version` starts at 1
- Backward incompatible change → new version
- Old versions MUST be supported for replay

## 7. Error Handling Contract

If TuringCore-v3 cannot apply an event:

**It MUST:**

- persist the event
- flag it for operator review

**It MUST NOT:**

- drop the event
- auto-correct silently

## 8. Audit & Evidence Alignment

Every ledger posting MUST reference:

- `event_id`
- `correlation_id`
- `payment_id`

This creates a provable chain:

```
PaymentInitiated
 → PaymentSent
 → PaymentSettled
 → LedgerEntry
```

## 9. Why This Contract Is Strong

1. It cleanly separates decision truth from economic truth
2. It allows Rails to be replaced without touching the ledger
3. It allows the ledger to be replaced without touching orchestration
4. It survives audits, disputes, and replay

## 10. Implementation Requirements

### Rails CI (turing-payments-rails)

- Schema validation before emit
- Event envelope validation
- Idempotency key generation

### TuringCore-v3 Ingestion

- Schema validation before apply
- Idempotency enforcement
- Event persistence
- Replay capability

---

**Version:** 1.0  
**Status:** Immutable  
**Last Updated:** December 2024
