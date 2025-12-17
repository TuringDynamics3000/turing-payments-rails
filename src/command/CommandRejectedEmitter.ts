/**
 * CommandRejected event emitter for turing-payments-rails.
 * 
 * Emits CommandRejected events for all command rejection scenarios.
 * 
 * Philosophy:
 * - Every rejection MUST emit CommandRejected
 * - CommandRejected is audit-only (no ledger mutation)
 * - Rejection reasons are machine-readable (reason_code)
 * - Rejection messages are human-readable (reason_message)
 */

import { v4 as uuidv4 } from 'uuid';
import { validateEvent } from '../emit/validateEvent';

export enum RejectionReason {
  DUPLICATE_COMMAND = 'DUPLICATE_COMMAND',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export interface CommandRejectedPayload {
  command_id: string;
  command_type: string;
  reason_code: RejectionReason;
  reason_message: string;
  rejected_at: string;
  correlation_id?: string;
  metadata?: Record<string, any>;
}

export class CommandRejectedEmitter {
  /**
   * Emit CommandRejected event.
   * 
   * @param payload - CommandRejected payload
   * @returns Event ID
   */
  async emit(payload: CommandRejectedPayload): Promise<string> {
    const event_id = uuidv4();
    const occurred_at = new Date().toISOString();

    const event = {
      event_id,
      event_type: 'command_rejected.v1',
      occurred_at,
      schema_version: 'v1',
      correlation_id: payload.correlation_id || event_id,
      payload: {
        command_id: payload.command_id,
        command_type: payload.command_type,
        reason_code: payload.reason_code,
        reason_message: payload.reason_message,
        rejected_at: payload.rejected_at,
        metadata: payload.metadata || {},
      },
    };

    // Validate event before emission
    validateEvent(event);

    // Emit event (placeholder - actual implementation would publish to event bus)
    console.log('[CommandRejected]', JSON.stringify(event, null, 2));

    return event_id;
  }

  /**
   * Emit CommandRejected for duplicate command.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param correlation_id - Optional correlation ID
   * @returns Event ID
   */
  async emitDuplicateCommand(
    command_id: string,
    command_type: string,
    correlation_id?: string,
  ): Promise<string> {
    return this.emit({
      command_id,
      command_type,
      reason_code: RejectionReason.DUPLICATE_COMMAND,
      reason_message: `Command ${command_id} has already been processed`,
      rejected_at: new Date().toISOString(),
      correlation_id,
    });
  }

  /**
   * Emit CommandRejected for schema validation failure.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param validation_error - Validation error message
   * @param correlation_id - Optional correlation ID
   * @returns Event ID
   */
  async emitInvalidSchema(
    command_id: string,
    command_type: string,
    validation_error: string,
    correlation_id?: string,
  ): Promise<string> {
    return this.emit({
      command_id,
      command_type,
      reason_code: RejectionReason.INVALID_SCHEMA,
      reason_message: `Command validation failed: ${validation_error}`,
      rejected_at: new Date().toISOString(),
      correlation_id,
      metadata: { validation_error },
    });
  }

  /**
   * Emit CommandRejected for business rule violation.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param rule_violation - Business rule violation message
   * @param correlation_id - Optional correlation ID
   * @returns Event ID
   */
  async emitBusinessRuleViolation(
    command_id: string,
    command_type: string,
    rule_violation: string,
    correlation_id?: string,
  ): Promise<string> {
    return this.emit({
      command_id,
      command_type,
      reason_code: RejectionReason.BUSINESS_RULE_VIOLATION,
      reason_message: `Business rule violation: ${rule_violation}`,
      rejected_at: new Date().toISOString(),
      correlation_id,
      metadata: { rule_violation },
    });
  }

  /**
   * Emit CommandRejected for insufficient funds.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param required_amount - Required amount
   * @param available_amount - Available amount
   * @param correlation_id - Optional correlation ID
   * @returns Event ID
   */
  async emitInsufficientFunds(
    command_id: string,
    command_type: string,
    required_amount: number,
    available_amount: number,
    correlation_id?: string,
  ): Promise<string> {
    return this.emit({
      command_id,
      command_type,
      reason_code: RejectionReason.INSUFFICIENT_FUNDS,
      reason_message: `Insufficient funds: required ${required_amount}, available ${available_amount}`,
      rejected_at: new Date().toISOString(),
      correlation_id,
      metadata: { required_amount, available_amount },
    });
  }

  /**
   * Emit CommandRejected for invalid state transition.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param current_state - Current state
   * @param attempted_transition - Attempted transition
   * @param correlation_id - Optional correlation ID
   * @returns Event ID
   */
  async emitInvalidStateTransition(
    command_id: string,
    command_type: string,
    current_state: string,
    attempted_transition: string,
    correlation_id?: string,
  ): Promise<string> {
    return this.emit({
      command_id,
      command_type,
      reason_code: RejectionReason.INVALID_STATE_TRANSITION,
      reason_message: `Invalid state transition: ${current_state} -> ${attempted_transition}`,
      rejected_at: new Date().toISOString(),
      correlation_id,
      metadata: { current_state, attempted_transition },
    });
  }
}

// Global singleton instance
let globalEmitter: CommandRejectedEmitter | null = null;

/**
 * Get global CommandRejected emitter.
 * 
 * @returns Global emitter instance
 */
export function getCommandRejectedEmitter(): CommandRejectedEmitter {
  if (!globalEmitter) {
    globalEmitter = new CommandRejectedEmitter();
  }
  return globalEmitter;
}
