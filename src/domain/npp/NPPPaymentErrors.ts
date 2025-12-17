/**
 * NPP Payment Domain Errors
 * 
 * All errors are explicit and typed for proper error handling
 */

import { NPPPaymentState } from "./NPPPaymentState";

export class IllegalTransitionError extends Error {
  constructor(from: NPPPaymentState, to: NPPPaymentState) {
    super(`ILLEGAL_NPP_TRANSITION: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(`INVARIANT_VIOLATION: ${message}`);
    this.name = "InvariantViolationError";
  }
}

export class OpsViolationError extends Error {
  constructor(message: string) {
    super(`OPS_VIOLATION: ${message}`);
    this.name = "OpsViolationError";
  }
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(`REPLAY_ERROR: ${message}`);
    this.name = "ReplayError";
  }
}

export class UnknownEventTypeError extends Error {
  constructor(eventType: string) {
    super(`UNKNOWN_EVENT_TYPE: ${eventType}`);
    this.name = "UnknownEventTypeError";
  }
}
