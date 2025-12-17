# RTGS vs NPP: Diff Documentation

## Mental Model Shift

**RTGS is governance-first, not throughput-first.**

If NPP tests async correctness, RTGS tests decision authority and evidence.

---

## 1. Lifecycle Differences

### 1.1 State Changes

**REMOVE (NPP-only):**
- `ACKNOWLEDGED` - RTGS does not "auto-ACK"

**ADD (RTGS-only):**
- `PENDING_APPROVAL` - Awaiting dual-control approval
- `APPROVED` - All approvals granted
- `REJECTED` - Approval denied (terminal)

### 1.2 RTGS Lifecycle

```
CREATED
 → PENDING_APPROVAL
 → APPROVED
 → SENT
 → SETTLED
```

**Rejection / Failure Paths:**
```
PENDING_APPROVAL → REJECTED (terminal)
APPROVED         → FAILED
SENT             → FAILED
```

---

## 2. State Transition Diff Table

| From | To | NPP | RTGS |
|------|-----|-----|------|
| AUTHORISED → SENT | ✅ | ❌ |
| AUTHORISED → PENDING_APPROVAL | ❌ | ✅ |
| PENDING_APPROVAL → APPROVED | ❌ | ✅ |
| PENDING_APPROVAL → REJECTED | ❌ | ✅ |
| APPROVED → SENT | ❌ | ✅ |
| SENT → SETTLED | ✅ | ✅ |

**Key Difference:** RTGS requires approval before sending. NPP sends immediately after authorization.

---

## 3. Core RTGS Invariants

### 3.1 Approval Invariants (Non-Negotiable)

| Rule | Why |
|------|-----|
| No SEND without APPROVED | Human governance |
| Approval must be dual-control | Fraud & APRA expectation |
| Approver ≠ initiator | Separation of duties |
| Approval timestamp immutable | Evidence |

### 3.2 Dual-Control Requirements

- **Minimum 2 approvers** for payments > $1M AUD
- **Minimum 3 approvers** for payments > $10M AUD
- All approvers must be **unique** (no duplicate approvals)
- Initiator **cannot approve** their own payment

### 3.3 Required Approval Roles

| Amount Range | Required Roles | Min Approvers |
|--------------|----------------|---------------|
| $1M - $10M | FIRST_APPROVER, SECOND_APPROVER | 2 |
| > $10M | FIRST_APPROVER, SECOND_APPROVER, EXECUTIVE_APPROVER | 3 |

---

## 4. Event Differences

### 4.1 NPP Events

- `PaymentIntentCreated`
- `PaymentAuthorised`
- `PaymentSent`
- `PaymentAcknowledged` ← **NPP-only**
- `PaymentSettled`
- `PaymentFailed`

### 4.2 RTGS Events

- `PaymentIntentCreated`
- `ApprovalRequested` ← **RTGS-only**
- `ApprovalGranted` ← **RTGS-only**
- `DualControlVerified` ← **RTGS-only**
- `ApprovalRejected` ← **RTGS-only**
- `PaymentAuthorised`
- `PaymentSent`
- `PaymentSettled`
- `PaymentFailed`

**Key Addition:** RTGS adds 4 approval-specific events for audit trail.

---

## 5. Ops & Governance Diff

### 5.1 Ops Actions

| Action | NPP | RTGS |
|--------|-----|------|
| Retry | FAILED | FAILED |
| Cancel | AUTHORISED | PENDING_APPROVAL |
| Approve | ❌ | PENDING_APPROVAL |
| Reject | ❌ | PENDING_APPROVAL |

**New Actions:** RTGS adds `Approve` and `Reject` operator actions.

### 5.2 Approval Workflow

Every approval emits:
- `ApprovalGranted` (success)
- `ApprovalRejected` (denial)

Both are **evidence-critical events** for regulator audit.

---

## 6. Evidence Pack Additions

### 6.1 NPP Evidence Pack

```json
{
  "paymentIntent": {...},
  "railDecision": {...},
  "attempts": [...],
  "lifecycle": [...],
  "opsActions": [...],
  "replayProof": {...}
}
```

### 6.2 RTGS Evidence Pack (Additional Fields)

```json
{
  "approvals": [
    {
      "approver_id": "string",
      "role": "FIRST_APPROVER",
      "approved_at": "ISO-8601",
      "approval_reason": "string"
    }
  ],
  "approval_policy": "DUAL_CONTROL",
  "required_approvers": 2,
  "separation_of_duties_verified": true
}
```

---

## 7. Economic Invariants

### 7.1 Shared Invariants (NPP + RTGS)

- Single settlement
- Funds conservation
- Terminal state immutability

### 7.2 RTGS-Specific Invariants

- **Approval before send:** Cannot send without `APPROVED` state
- **Approval expiry:** Approvals expire after configured time
- **Event ordering:** All events must be chronologically ordered

---

## 8. Why RTGS Comes After NPP

If you cannot:
1. Enforce invariants
2. Handle state transitions
3. Replay decisions

Then RTGS approvals will become **rubber stamps**, which regulators will destroy you for.

---

## 9. Implementation Checklist

- [x] RTGS state machine (7 states)
- [x] RTGS state transitions matrix
- [x] RTGS events (9 event types)
- [x] RTGS invariants (4 categories)
- [x] RTGS payment aggregate
- [x] Approval workflow handlers
- [x] Dual-control verification
- [x] Separation of duties enforcement
- [ ] RTGS tests (approval workflows, dual-control, replay)
- [ ] RTGS evidence pack builder

---

## 10. Testing Strategy

### 10.1 Approval Workflow Tests

- Grant approval (happy path)
- Reject approval (denial path)
- Dual-control verification
- Separation of duties enforcement
- Approval expiry

### 10.2 Invariant Tests

- No send without approved
- Duplicate approval rejection
- Initiator cannot approve
- Required roles present
- Approval not expired

### 10.3 Replay Tests

- Rebuild payment from events
- Verify state hash matches
- Deterministic replay guarantee

---

## Summary

**RTGS = NPP + Approval Workflows + Dual-Control + Separation of Duties**

The key difference is **governance-first design**: every high-value payment must be approved by multiple independent parties before it can be sent.
