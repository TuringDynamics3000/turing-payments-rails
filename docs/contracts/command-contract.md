# Command Contract

**UI / Core / Ops → turing-payments-rails**

## Command Philosophy

### Commands are intent, not facts

- Commands express what the caller **wants** to happen
- Commands may be **rejected** if invalid or impossible
- Commands do **not** return state (use events for that)

### Commands are idempotent

- Every command has a `command_id` (UUID)
- Reprocessing the same `command_id` is a safe no-op
- Duplicate commands do not cause duplicate payments

### Commands may be rejected

- Validation failures → 400 error
- Business rule violations → CommandRejected event
- State conflicts → CommandRejected event

### Events are the response

- Command acceptance → 202 Accepted
- Command outcome → PaymentInitiated / CommandRejected event
- State changes → Lifecycle events (PaymentSent, PaymentSettled, etc.)

## Command Types

### 1. InitiatePaymentCommand

**Purpose:** Request to initiate a new payment

**Required fields:**
- `command_id` (UUID) - Idempotency key
- `payment_id` (string) - Unique payment identifier
- `rail` (enum) - NPP | BECS | RTGS | CARDS
- `amount` (number) - Positive amount
- `currency` (string) - AUD
- `source_account_id` (string)
- `destination` (object) - { type, value }

**Outcomes:**
- ✅ `PaymentInitiated` event → Payment created
- ❌ `CommandRejected` event → Validation failed

**Idempotency:**
- Same `command_id` → no-op (202 Accepted)
- Same `payment_id` with different `command_id` → rejected

### 2. RetryPaymentCommand

**Purpose:** Request to retry a failed payment

**Required fields:**
- `command_id` (UUID) - Idempotency key
- `payment_id` (string) - Payment to retry

**Preconditions:**
- Payment must be in FAILED state

**Outcomes:**
- ✅ `PaymentAttemptCreated` event → Retry initiated
- ❌ `CommandRejected` event → Not in FAILED state

### 3. CancelPaymentCommand

**Purpose:** Request to cancel a pending payment

**Required fields:**
- `command_id` (UUID) - Idempotency key
- `payment_id` (string) - Payment to cancel
- `reason` (string) - Cancellation reason

**Preconditions:**
- Payment must be in non-terminal state (not SETTLED, FAILED, or EXPIRED)

**Outcomes:**
- ✅ `PaymentCancelled` event → Payment cancelled
- ❌ `CommandRejected` event → Already terminal

## Command Handling Rules

### Rule 1: Commands are idempotent by command_id

```python
if command_store.has_command(command_id):
    return {"status": "accepted"}  # no-op
```

### Rule 2: Commands do not return state

```python
# ❌ Bad
return {"status": "accepted", "payment_state": "INITIATED"}

# ✅ Good
return {"status": "accepted"}
```

State is communicated via events, not command responses.

### Rule 3: All outcomes are emitted as events

```python
# Command accepted
emit_event(PaymentInitiated(...))

# Command rejected
emit_event(CommandRejected(
    command_id=cmd.command_id,
    reason="Payment already exists"
))
```

### Rule 4: Rejections are events, not errors

```python
# ❌ Bad
raise ValueError("Payment already exists")

# ✅ Good
emit_event(CommandRejected(...))
return {"status": "accepted"}  # 202
```

Only validation errors return 400.

Business rule violations return 202 + CommandRejected event.

## Integration Example

### Caller (UI / Core / Ops)

```typescript
// Send command
const response = await fetch('/commands/payments/initiate', {
  method: 'POST',
  body: JSON.stringify({
    command_id: uuid(),
    payment_id: 'pay_123',
    rail: 'NPP',
    amount: 100.00,
    currency: 'AUD',
    source_account_id: 'acc_456',
    destination: {
      type: 'PAYID',
      value: 'user@example.com'
    }
  })
});

// Command accepted (202)
// Now wait for events...

// Subscribe to events
eventBus.on('PaymentInitiated', (event) => {
  if (event.payload.payment_id === 'pay_123') {
    console.log('Payment initiated');
  }
});

eventBus.on('CommandRejected', (event) => {
  if (event.payload.command_id === commandId) {
    console.error('Command rejected:', event.payload.reason);
  }
});
```

### Rails (Command Handler)

```typescript
async function handleInitiatePayment(cmd: InitiatePaymentCommand) {
  // Idempotency check
  if (await commandStore.has(cmd.command_id)) {
    return { status: 'accepted' };
  }

  // Validation (throws 400 if invalid)
  validateCommand(cmd);

  // Business logic
  if (await paymentExists(cmd.payment_id)) {
    await emitEvent({
      event_type: 'CommandRejected',
      payload: {
        command_id: cmd.command_id,
        reason: 'Payment already exists'
      }
    });
    return { status: 'accepted' };
  }

  // Create payment
  const payment = await createPayment(cmd);
  
  // Emit event
  await emitEvent({
    event_type: 'PaymentInitiated',
    payload: {
      payment_id: cmd.payment_id,
      rail: cmd.rail,
      amount: cmd.amount,
      // ...
    }
  });

  // Persist command
  await commandStore.persist(cmd.command_id);

  return { status: 'accepted' };
}
```

## Why This Contract Is Strong

1. **Idempotency** - Safe retries, no duplicate payments
2. **Event-driven** - Decoupled, auditable, replayable
3. **Rejection as events** - Consistent handling, no exceptions
4. **Command/Query separation** - Commands don't return state
5. **Audit trail** - Every command + outcome is recorded

## Contract Status

**Version:** 1.0  
**Status:** Frozen  
**Last Updated:** December 2024

---

See also:
- [payments-ledger-contract.md](./payments-ledger-contract.md) - Event contract (Rails → Ledger)
- [openapi.yaml](../../openapi.yaml) - OpenAPI specification
