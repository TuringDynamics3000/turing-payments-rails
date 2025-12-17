# Command Rejection

**Every rejected command becomes an auditable, replayable fact.**

## Philosophy

Commands never fail silently. Every rejection must emit a `CommandRejected` event.

This gives you:
- **Auditability** - Every rejection is recorded
- **Analytics** - Track rejection patterns
- **Regulator-safe denial evidence** - Prove compliance
- **Replayable decision history** - Reconstruct what happened

## When CommandRejected is Emitted

### 1. INVALID_SCHEMA

Command payload fails schema validation.

**Example:**
```typescript
{
  command_id: "cmd_001",
  payment_id: "pay_001",
  rail: "INVALID_RAIL",  // Not in enum
  // ...
}
```

**Response:**
```typescript
{
  event_type: "CommandRejected",
  payload: {
    command_id: "cmd_001",
    entity_type: "PAYMENT",
    entity_id: null,
    reason_code: "INVALID_SCHEMA",
    reason_message: "Invalid rail: INVALID_RAIL. Must be one of: NPP, BECS, RTGS, CARDS"
  }
}
```

### 2. INVARIANT_VIOLATION

Command violates business invariants.

**Example:**
```typescript
{
  command_id: "cmd_002",
  payment_id: "pay_002",
  amount: -100.00,  // Negative amount
  // ...
}
```

**Response:**
```typescript
{
  event_type: "CommandRejected",
  payload: {
    command_id: "cmd_002",
    entity_type: "PAYMENT",
    entity_id: null,
    reason_code: "INVARIANT_VIOLATION",
    reason_message: "Payment amount must be positive"
  }
}
```

### 3. POLICY_DENIED

Command denied by policy rules.

**Example:**
```typescript
{
  command_id: "cmd_003",
  payment_id: "pay_003",
  amount: 1000000.00,  // Exceeds limit
  // ...
}
```

**Response:**
```typescript
{
  event_type: "CommandRejected",
  payload: {
    command_id: "cmd_003",
    entity_type: "PAYMENT",
    entity_id: "pay_003",
    reason_code: "POLICY_DENIED",
    reason_message: "Payment amount exceeds daily limit"
  }
}
```

### 4. LIFECYCLE_MISMATCH

Command incompatible with current entity state.

**Example:**
```typescript
// Trying to retry a payment that's already settled
{
  command_id: "cmd_004",
  payment_id: "pay_004"  // Already in SETTLED state
}
```

**Response:**
```typescript
{
  event_type: "CommandRejected",
  payload: {
    command_id: "cmd_004",
    entity_type: "PAYMENT",
    entity_id: "pay_004",
    reason_code: "LIFECYCLE_MISMATCH",
    reason_message: "Cannot retry payment in SETTLED state"
  }
}
```

### 5. DUPLICATE_COMMAND

Command with same `command_id` already processed.

**Example:**
```typescript
// Same command_id sent twice
{
  command_id: "cmd_005",  // Already processed
  payment_id: "pay_005"
}
```

**Response:**
```typescript
{
  event_type: "CommandRejected",
  payload: {
    command_id: "cmd_005",
    entity_type: "PAYMENT",
    entity_id: "pay_005",
    reason_code: "DUPLICATE_COMMAND",
    reason_message: "Command cmd_005 already processed"
  }
}
```

## Command Handling Rule (Hard)

**Rule:** Commands never fail silently.

```typescript
async function handleCommand(cmd: Command): Promise<void> {
  // Validate
  if (!validateSchema(cmd)) {
    await emitEvent({
      event_type: "CommandRejected",
      payload: {
        command_id: cmd.command_id,
        entity_type: cmd.entity_type,
        entity_id: null,
        reason_code: "INVALID_SCHEMA",
        reason_message: "..."
      }
    });
    return;  // 202 Accepted (rejection is an event, not an error)
  }

  // Check invariants
  if (!checkInvariants(cmd)) {
    await emitEvent({
      event_type: "CommandRejected",
      payload: {
        command_id: cmd.command_id,
        entity_type: cmd.entity_type,
        entity_id: null,
        reason_code: "INVARIANT_VIOLATION",
        reason_message: "..."
      }
    });
    return;
  }

  // Execute command
  try {
    await executeCommand(cmd);
  } catch (error) {
    await emitEvent({
      event_type: "CommandRejected",
      payload: {
        command_id: cmd.command_id,
        entity_type: cmd.entity_type,
        entity_id: cmd.entity_id,
        reason_code: "POLICY_DENIED",
        reason_message: error.message
      }
    });
  }
}
```

## HTTP Response

**Important:** Command rejections return `202 Accepted`, not `400 Bad Request`.

```typescript
// ❌ Bad
if (!valid) {
  throw new Error("Invalid command");  // 500 error
}

// ✅ Good
if (!valid) {
  await emitEvent(CommandRejected(...));
  return { status: "accepted" };  // 202
}
```

**Why?**
- Rejection is a business outcome, not a technical error
- Caller should subscribe to events to see outcome
- Idempotent retries work correctly

## Analytics

Track rejection patterns to identify issues:

```sql
SELECT 
  reason_code,
  COUNT(*) as rejection_count,
  COUNT(DISTINCT entity_id) as affected_entities
FROM ingested_events
WHERE event_type = 'CommandRejected'
  AND occurred_at > NOW() - INTERVAL '24 hours'
GROUP BY reason_code
ORDER BY rejection_count DESC;
```

## Audit Trail

Every rejection is permanently recorded:

```sql
SELECT 
  event_id,
  occurred_at,
  payload->>'command_id' as command_id,
  payload->>'reason_code' as reason_code,
  payload->>'reason_message' as reason_message
FROM ingested_events
WHERE event_type = 'CommandRejected'
  AND payload->>'entity_id' = 'pay_123'
ORDER BY occurred_at DESC;
```

## Regulator Evidence

Prove compliance by showing rejection evidence:

```
Q: "Why was this payment denied?"
A: "CommandRejected event evt_456 shows POLICY_DENIED: 
    'Payment amount exceeds daily limit'"

Q: "Can you prove this decision was made at the time?"
A: "Event occurred_at: 2024-12-17T10:00:00Z, 
    immutably recorded in event store"
```

## Status

**Version:** 1.0  
**Status:** Frozen  
**Last Updated:** December 2024

---

See also:
- [command-contract.md](./contracts/command-contract.md) - Command contract
- [schemas/command_rejected.v1.json](../schemas/command_rejected.v1.json) - JSON Schema
