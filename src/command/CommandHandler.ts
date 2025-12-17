/**
 * Base command handler with idempotency enforcement.
 * 
 * All command handlers MUST extend this class to ensure:
 * - Idempotency check before processing
 * - CommandRejected emission on rejection
 * - Consistent error handling
 */

import {
  getCommandIdempotencyStore,
  CommandIdempotencyStore,
} from './CommandIdempotencyStore';
import {
  getCommandRejectedEmitter,
  CommandRejectedEmitter,
  RejectionReason,
} from './CommandRejectedEmitter';

export interface Command {
  command_id: string;
  command_type: string;
  correlation_id?: string;
  [key: string]: any;
}

export interface CommandResult {
  success: boolean;
  event_id?: string;
  rejection_event_id?: string;
  reason?: string;
}

export abstract class CommandHandler<T extends Command> {
  protected idempotencyStore: CommandIdempotencyStore;
  protected rejectedEmitter: CommandRejectedEmitter;

  constructor() {
    this.idempotencyStore = getCommandIdempotencyStore();
    this.rejectedEmitter = getCommandRejectedEmitter();
  }

  /**
   * Handle command with idempotency enforcement.
   * 
   * @param command - Command to handle
   * @returns Command result
   */
  async handle(command: T): Promise<CommandResult> {
    const { command_id, command_type, correlation_id } = command;

    // Step 1: Idempotency check
    if (this.idempotencyStore.isProcessed(command_id)) {
      // Emit CommandRejected for duplicate command
      const rejection_event_id = await this.rejectedEmitter.emitDuplicateCommand(
        command_id,
        command_type,
        correlation_id,
      );

      return {
        success: false,
        rejection_event_id,
        reason: 'Duplicate command',
      };
    }

    try {
      // Step 2: Validate command
      this.validate(command);

      // Step 3: Execute business logic
      const event_id = await this.execute(command);

      // Step 4: Mark as processed
      this.idempotencyStore.markProcessed(command_id, command_type, event_id);

      return {
        success: true,
        event_id,
      };
    } catch (error) {
      // Step 5: Handle rejection
      return await this.handleRejection(command, error as Error);
    }
  }

  /**
   * Validate command (override in subclass).
   * 
   * @param command - Command to validate
   * @throws Error if validation fails
   */
  protected abstract validate(command: T): void;

  /**
   * Execute command business logic (override in subclass).
   * 
   * @param command - Command to execute
   * @returns Event ID of emitted event
   * @throws Error if execution fails
   */
  protected abstract execute(command: T): Promise<string>;

  /**
   * Handle command rejection.
   * 
   * @param command - Command that was rejected
   * @param error - Rejection error
   * @returns Command result with rejection event
   */
  protected async handleRejection(
    command: T,
    error: Error,
  ): Promise<CommandResult> {
    const { command_id, command_type, correlation_id } = command;

    // Determine rejection reason
    let rejection_event_id: string;

    if (error.message.includes('validation')) {
      rejection_event_id = await this.rejectedEmitter.emitInvalidSchema(
        command_id,
        command_type,
        error.message,
        correlation_id,
      );
    } else if (error.message.includes('insufficient funds')) {
      // Extract amounts from error message (simplified)
      rejection_event_id = await this.rejectedEmitter.emitInsufficientFunds(
        command_id,
        command_type,
        0, // TODO: Extract from error
        0, // TODO: Extract from error
        correlation_id,
      );
    } else if (error.message.includes('state transition')) {
      rejection_event_id = await this.rejectedEmitter.emitInvalidStateTransition(
        command_id,
        command_type,
        'unknown', // TODO: Extract from error
        'unknown', // TODO: Extract from error
        correlation_id,
      );
    } else {
      // Generic business rule violation
      rejection_event_id = await this.rejectedEmitter.emitBusinessRuleViolation(
        command_id,
        command_type,
        error.message,
        correlation_id,
      );
    }

    return {
      success: false,
      rejection_event_id,
      reason: error.message,
    };
  }
}
