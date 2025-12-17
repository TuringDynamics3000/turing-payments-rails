# Payment Event Schemas

JSON Schema definitions for all events emitted by turing-payments-rails.

## Schema Files

### Core Envelope

- **event-envelope.v1.json** - Canonical event envelope (required for all events)

### Lifecycle Events (No Ledger Action)

- **payment-initiated.v1.json** - Payment created
- **payment-attempt-created.v1.json** - Attempt started
- **payment-sent.v1.json** - Sent to rail
- **payment-acknowledged.v1.json** - Acknowledged by rail (NPP only)
- **payment-expired.v1.json** - Payment expired

### Economic Events (Ledger Action Required)

- **payment-settled.v1.json** - ✅ POST LEDGER ENTRY
- **payment-reversed.v1.json** - ✅ POST REVERSAL ENTRY
- **card-chargeback-received.v1.json** - ✅ REVERSE PRIOR SETTLEMENT

### Failure Events (No Ledger Action)

- **payment-failed.v1.json** - Payment failed (may release holds)

### Cards-Specific Events

- **card-authorised.v1.json** - Card authorization (no posting)
- **card-captured.v1.json** - Card capture (no posting)
- **card-chargeback-received.v1.json** - Chargeback (reversal required)

## Usage

### Validation in Rails CI

All events MUST be validated against their schema before emission:

```typescript
import Ajv from 'ajv';
import envelopeSchema from './schemas/event-envelope.v1.json';
import settledSchema from './schemas/payment-settled.v1.json';

const ajv = new Ajv();
const validateEnvelope = ajv.compile(envelopeSchema);
const validateSettled = ajv.compile(settledSchema);

// Before emitting
if (!validateEnvelope(event)) {
  throw new Error('Invalid event envelope');
}
if (!validateSettled(event)) {
  throw new Error('Invalid PaymentSettled payload');
}
```

### Validation in TuringCore-v3

All events MUST be validated before ingestion:

```python
import jsonschema

with open('schemas/event-envelope.v1.json') as f:
    envelope_schema = json.load(f)

with open('schemas/payment-settled.v1.json') as f:
    settled_schema = json.load(f)

# Before applying
jsonschema.validate(event, envelope_schema)
jsonschema.validate(event, settled_schema)
```

## Versioning

- Schema versions start at 1
- Backward-incompatible changes require new version
- Old versions MUST be supported for replay

## Contract

See [docs/contracts/payments-ledger-contract.md](../docs/contracts/payments-ledger-contract.md) for the full contract between turing-payments-rails and TuringCore-v3.

## Ledger Posting Rules

Only these events trigger ledger postings:

1. **PaymentSettled** - Post settlement entry
2. **PaymentReversed** - Post reversal entry
3. **CardChargebackReceived** - Reverse prior settlement

**All other events = NO ledger action**

Any other posting is a contract violation.
