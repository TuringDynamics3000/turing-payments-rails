# NPP Orchestration Operator Runbook

**Operational Procedures for NPP Payment Management**

## Overview

This runbook provides step-by-step procedures for operators managing NPP payments in production. All actions are policy-gated and emit immutable events.

**Target Audience:** Operations team, support engineers, incident responders

## Quick Reference

| Scenario | Action | Required State | Policy Gate |
|----------|--------|----------------|-------------|
| Payment stuck in SENT | Retry Payment | FAILED | Resolve approval |
| Customer cancellation | Cancel Payment | CREATED, AUTHORISED, SENT | Resolve approval |
| External rail failure | Mark Failed | SENT, ACKNOWLEDGED | Resolve approval |
| Investigate payment | View Evidence Pack | Any | Read-only |
| Verify replay | Run Replay Test | Any | Read-only |

## Operator Actions

### 1. Retry Payment

**When to Use:**
- Payment failed due to temporary rail issue
- Network timeout during submission
- Transient NPP service disruption

**Prerequisites:**
- Payment state: `FAILED`
- Resolve approval obtained
- Failure reason indicates retry is safe (e.g., `RAIL`, `TIMEOUT`)

**Procedure:**

```bash
# Step 1: Verify payment state
GET /api/payments/{paymentIntentId}
# Expected: state === "FAILED"

# Step 2: Check failure reason
GET /api/payments/{paymentIntentId}/events
# Look for PaymentFailed event with reason

# Step 3: Obtain Resolve approval
# Navigate to Resolve UI → Payment Decisions → Request Retry Approval
# Wait for policy evaluation

# Step 4: Execute retry
POST /api/payments/{paymentIntentId}/retry
{
  "attemptId": "att_002",
  "reason": "Resolve approved retry after rail timeout"
}

# Step 5: Monitor new attempt
GET /api/payments/{paymentIntentId}
# Expected: state transitions to SENT → ACKNOWLEDGED → SETTLED
```

**Expected Events Emitted:**
1. `PaymentAttemptCreated` (attemptId: att_002)
2. `PaymentSentToRail` (new attempt)
3. `PaymentAcknowledged` (if successful)
4. `PaymentSettled` (if successful)

**Rollback:**
- Retries are idempotent—no rollback needed
- If retry fails, payment returns to FAILED state
- New failure event is emitted

**Monitoring:**
- Check NPP Rail API logs for submission confirmation
- Monitor payment state transitions in real-time
- Alert if retry fails again (escalate to engineering)

---

### 2. Cancel Payment

**When to Use:**
- Customer requests cancellation
- Fraud detected before settlement
- Duplicate payment identified

**Prerequisites:**
- Payment state: `CREATED`, `AUTHORISED`, or `SENT`
- Resolve approval obtained
- Customer confirmation (if customer-initiated)

**Procedure:**

```bash
# Step 1: Verify payment state
GET /api/payments/{paymentIntentId}
# Expected: state === "CREATED" | "AUTHORISED" | "SENT"

# Step 2: Verify payment is not terminal
# Cannot cancel if state === "SETTLED" | "FAILED" | "EXPIRED"

# Step 3: Obtain Resolve approval
# Navigate to Resolve UI → Payment Decisions → Request Cancellation Approval
# Provide reason: "Customer requested cancellation"

# Step 4: Execute cancellation
POST /api/payments/{paymentIntentId}/cancel
{
  "reason": "Customer requested cancellation",
  "operatorId": "ops_001",
  "customerId": "cust_12345"
}

# Step 5: Verify cancellation
GET /api/payments/{paymentIntentId}
# Expected: state === "FAILED", reason === "CANCELLED"
```

**Expected Events Emitted:**
1. `PaymentFailed` (reason: CANCELLED)

**Rollback:**
- Cancellations are irreversible (terminal state)
- If cancelled in error, create new payment intent

**Monitoring:**
- Verify funds are released (check Deposits Core)
- Confirm customer notification sent
- Log cancellation in audit trail

---

### 3. Mark Failed

**When to Use:**
- External rail reports failure
- NPP callback indicates rejection
- Manual intervention required after investigation

**Prerequisites:**
- Payment state: `SENT` or `ACKNOWLEDGED`
- Resolve approval obtained
- Failure reason documented

**Procedure:**

```bash
# Step 1: Verify payment state
GET /api/payments/{paymentIntentId}
# Expected: state === "SENT" | "ACKNOWLEDGED"

# Step 2: Obtain Resolve approval
# Navigate to Resolve UI → Payment Decisions → Request Mark Failed Approval
# Provide reason: "External rail reported failure"

# Step 3: Execute mark failed
POST /api/payments/{paymentIntentId}/mark-failed
{
  "reason": "RAIL",
  "details": "NPP rail returned error code 503",
  "operatorId": "ops_001"
}

# Step 4: Verify failure recorded
GET /api/payments/{paymentIntentId}
# Expected: state === "FAILED", reason === "RAIL"
```

**Expected Events Emitted:**
1. `PaymentFailed` (reason: specified by operator)

**Rollback:**
- Failures are terminal—no rollback
- If marked failed in error, investigate and potentially retry

**Monitoring:**
- Verify funds are released (check Deposits Core)
- Alert customer of failure
- Log failure reason for analysis

---

## Incident Response

### Scenario 1: Payment Stuck in SENT

**Symptoms:**
- Payment state: `SENT`
- No acknowledgment from NPP rail after 5 minutes
- Customer reports payment not received

**Diagnosis:**

```bash
# Step 1: Check payment state
GET /api/payments/{paymentIntentId}

# Step 2: Check event timeline
GET /api/payments/{paymentIntentId}/events
# Look for last event timestamp

# Step 3: Check NPP Rail API logs
# Verify submission was successful
# Check for acknowledgment callback

# Step 4: Check Deposits Core
# Verify funds are still held
```

**Resolution:**

**Option A: Wait for NPP Rail**
- NPP acknowledgments can take up to 10 minutes
- Monitor for `PaymentAcknowledged` event
- If no ACK after 10 minutes, escalate

**Option B: Mark Failed (if NPP confirms failure)**
- Obtain Resolve approval
- Execute "Mark Failed" procedure (see above)
- Release held funds

**Option C: Contact NPP Support**
- Escalate to NPP rail support
- Provide externalRef from `PaymentSentToRail` event
- Wait for manual resolution

---

### Scenario 2: Payment Failed After Acknowledgment

**Symptoms:**
- Payment state: `FAILED`
- Previous state: `ACKNOWLEDGED`
- Customer reports payment not received

**Diagnosis:**

```bash
# Step 1: Check event timeline
GET /api/payments/{paymentIntentId}/events
# Verify PaymentAcknowledged was emitted
# Check PaymentFailed reason

# Step 2: Check NPP Rail API logs
# Look for settlement failure callback

# Step 3: Verify funds status
# Check Deposits Core for funds release
```

**Resolution:**

**This is a LATE FAILURE (NPP reality: ACK ≠ settlement)**

1. **Verify failure is legitimate**
   - Check NPP Rail API logs
   - Confirm settlement was rejected

2. **Retry if appropriate**
   - Obtain Resolve approval
   - Execute "Retry Payment" procedure
   - Monitor new attempt

3. **Notify customer**
   - Explain late failure (ACK ≠ settlement)
   - Provide new payment timeline

---

### Scenario 3: Duplicate Payment Detected

**Symptoms:**
- Two payments with same idempotency key
- Customer reports double charge

**Diagnosis:**

```bash
# Step 1: Search by idempotency key
GET /api/payments?idempotencyKey={key}
# Expected: Single payment (idempotency enforced)

# Step 2: If multiple payments found
# This indicates a bug—idempotency was bypassed
# ESCALATE TO ENGINEERING IMMEDIATELY

# Step 3: Check Deposits Core
# Verify funds were only debited once
```

**Resolution:**

**If idempotency was enforced (single payment):**
- No action needed—system worked correctly
- Inform customer only one payment was processed

**If idempotency was bypassed (multiple payments):**
- **CRITICAL BUG** - Escalate to engineering
- Cancel duplicate payments immediately
- Reverse duplicate ledger postings
- Investigate root cause

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Payment Success Rate**
   - Target: > 95%
   - Alert if < 90% over 5-minute window

2. **NPP Rail Latency**
   - Target: < 500ms
   - Alert if > 1s for 5 consecutive requests

3. **Retry Rate**
   - Target: < 5%
   - Alert if > 10% over 1-hour window

4. **Cancellation Rate**
   - Target: < 2%
   - Alert if > 5% over 1-hour window

5. **Late Failure Rate (ACK → FAILED)**
   - Target: < 1%
   - Alert if > 3% over 1-hour window

### Dashboard Widgets

**Operator Dashboard:**
- Real-time payment state distribution (pie chart)
- Payment throughput (line chart, last 24 hours)
- Failure reasons breakdown (bar chart)
- Retry success rate (gauge)
- NPP Rail API health (status indicator)

**Alert Panel:**
- Active incidents (count)
- Payments requiring attention (list)
- Policy approval queue (count)
- Recent operator actions (timeline)

---

## Evidence Pack Export

### When to Export Evidence Packs

- Regulator audit request
- Customer dispute investigation
- Internal compliance review
- Incident post-mortem

### Export Procedure

```bash
# Step 1: Generate evidence pack
POST /api/payments/{paymentIntentId}/evidence-pack
{
  "format": "JSON" | "PDF",
  "includeReplayProof": true
}

# Step 2: Download evidence pack
GET /api/payments/{paymentIntentId}/evidence-pack/download
# Returns: evidence_pack_{paymentIntentId}.json or .pdf

# Step 3: Verify replay proof
POST /api/payments/{paymentIntentId}/evidence-pack/verify
# Returns: { verified: true, hash: "abc123..." }
```

### Evidence Pack Contents

1. **Payment Intent** - Original payment details
2. **Rail Decisions** - Policy checks, balance verification
3. **Lifecycle Events** - Full event stream (ordered)
4. **Operator Actions** - Retry, cancel, mark failed
5. **Replay Proof** - SHA-256 hash verification

---

## Replay Verification

### When to Run Replay Tests

- After database migration
- After system upgrade
- During incident investigation
- For compliance verification

### Replay Procedure

```bash
# Step 1: Run replay test
pnpm test npp.replay

# Expected output:
# ✓ server/npp.replay.test.ts (7 tests) 8ms
#   ✓ should deterministically rebuild SETTLED state from events
#   ✓ should replay multiple times with identical results
#   ✓ should deterministically rebuild FAILED state from events
#   ✓ should deterministically rebuild state after retry
#   ✓ should deterministically rebuild state after cancellation
#   ✓ should produce same state regardless of replay order
#   ✓ should rebuild intermediate state from partial event log

# Step 2: Verify all tests pass
# If any test fails, ESCALATE IMMEDIATELY
# Replay failure indicates data corruption or bug

# Step 3: Run full test suite
pnpm test

# Expected: All 227 tests passing
```

### Replay Failure Response

**If replay tests fail:**

1. **STOP all payment processing immediately**
2. **Escalate to engineering**
3. **Do NOT attempt to fix manually**
4. **Preserve event store state for forensics**
5. **Notify stakeholders (CTO, compliance, regulators)**

**Replay failure is a CRITICAL incident.**

---

## Troubleshooting

### Payment Not Found

**Symptom:** `GET /api/payments/{paymentIntentId}` returns 404

**Possible Causes:**
- Incorrect paymentIntentId
- Payment not yet created
- Database replication lag

**Resolution:**
1. Verify paymentIntentId is correct
2. Check event store for PaymentIntentCreated event
3. Wait 30 seconds for replication lag
4. If still not found, escalate to engineering

---

### Invariant Violation Error

**Symptom:** API returns "INVARIANT_VIOLATION" error

**Possible Causes:**
- Illegal state transition attempted
- Economic rule violated (negative amount, double settlement)
- Idempotency check failed
- NPP-specific constraint violated

**Resolution:**
1. Read error message carefully (indicates which invariant)
2. Verify payment state is correct
3. Check event timeline for anomalies
4. If invariant violation is unexpected, escalate to engineering

**Do NOT attempt to bypass invariants.**

---

### Policy Gate Rejection

**Symptom:** Operator action rejected with "POLICY_REJECTED"

**Possible Causes:**
- Resolve policy evaluation failed
- Operator lacks required permissions
- State preconditions not met

**Resolution:**
1. Check Resolve policy logs
2. Verify operator has correct role
3. Verify payment state meets preconditions
4. If policy rejection is unexpected, escalate to compliance team

---

## Escalation Procedures

### Level 1: Operations Team

**Handles:**
- Standard payment retries
- Customer cancellations
- Evidence pack exports

**Escalate to Level 2 if:**
- Replay test fails
- Invariant violation occurs
- Multiple payments stuck in same state

### Level 2: Engineering Team

**Handles:**
- Replay failures
- Invariant violations
- System bugs
- Performance issues

**Escalate to Level 3 if:**
- Data corruption suspected
- Security incident detected
- Regulator inquiry received

### Level 3: CTO + Compliance

**Handles:**
- Critical incidents
- Regulator inquiries
- Security breaches
- Data corruption

**Notify immediately if:**
- Replay test fails
- Idempotency bypassed
- Unauthorized state mutation detected

---

## Compliance & Audit

### Audit Log Requirements

All operator actions MUST be logged with:
- Operator ID
- Timestamp (UTC)
- Action type (retry, cancel, mark failed)
- Payment intent ID
- Reason (free text)
- Resolve approval ID

### Retention Policy

- Event store: 10 years (regulatory requirement)
- Audit logs: 7 years
- Evidence packs: On-demand generation (no storage)

### Regulator Inquiries

**Response Procedure:**

1. **Acknowledge inquiry within 24 hours**
2. **Generate evidence pack for requested payments**
3. **Verify replay proof before submission**
4. **Submit evidence pack in requested format (JSON/PDF)**
5. **Log inquiry in compliance tracker**

---

## Contact Information

**Operations Team:** ops@turingdynamics.com  
**Engineering Team:** engineering@turingdynamics.com  
**Compliance Team:** compliance@turingdynamics.com  
**NPP Support:** support@nppa.com.au  

**Emergency Escalation:** +61 (0) 1234 5678 (24/7)

---

## Appendix: NPP State Machine Reference

```
CREATED → AUTHORISED → SENT → ACKNOWLEDGED → SETTLED (terminal)
                                           → FAILED (terminal)
                                           → EXPIRED (terminal)
```

**Terminal States:** SETTLED, FAILED, EXPIRED (no further transitions)

**Legal Transitions:**
- CREATED → AUTHORISED
- AUTHORISED → SENT, FAILED, EXPIRED
- SENT → ACKNOWLEDGED, FAILED, EXPIRED
- ACKNOWLEDGED → SETTLED, FAILED, EXPIRED

**Illegal Transitions:**
- Any transition FROM terminal state
- Backward transitions (e.g., SENT → CREATED)
- Skipping states (e.g., CREATED → SENT)

---

## Appendix: NPP Failure Reasons

| Reason | Description | Retry Safe? |
|--------|-------------|-------------|
| RAIL | External rail failure | ✅ Yes |
| TIMEOUT | Network timeout | ✅ Yes |
| INSUFFICIENT_FUNDS | Balance check failed | ❌ No |
| INVALID_ACCOUNT | Account not found | ❌ No |
| FRAUD | Fraud detected | ❌ No |
| CANCELLED | Operator cancelled | ❌ No |
| EXPIRED | Time window elapsed | ❌ No |

---

**Last Updated:** 2025-12-16  
**Version:** 1.0  
**Owner:** TuringDynamics Operations Team
