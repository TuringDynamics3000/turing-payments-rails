/**
 * Command idempotency store for turing-payments-rails.
 * 
 * Ensures commands are processed exactly once.
 * 
 * Philosophy:
 * - Every command MUST have a unique command_id
 * - Duplicate command_id = CommandRejected event
 * - Idempotency check happens BEFORE any business logic
 * - Command_id is immutable (never reused)
 */

export interface CommandRecord {
  command_id: string;
  command_type: string;
  processed_at: Date;
  result_event_id?: string;
}

export class CommandIdempotencyStore {
  private processedCommands: Map<string, CommandRecord> = new Map();

  /**
   * Check if command has already been processed.
   * 
   * @param command_id - Command ID to check
   * @returns true if already processed, false otherwise
   */
  isProcessed(command_id: string): boolean {
    return this.processedCommands.has(command_id);
  }

  /**
   * Get command record.
   * 
   * @param command_id - Command ID
   * @returns Command record or undefined
   */
  getRecord(command_id: string): CommandRecord | undefined {
    return this.processedCommands.get(command_id);
  }

  /**
   * Mark command as processed.
   * 
   * @param command_id - Command ID
   * @param command_type - Command type
   * @param result_event_id - Optional result event ID
   * @throws Error if command already processed
   */
  markProcessed(
    command_id: string,
    command_type: string,
    result_event_id?: string,
  ): void {
    if (this.isProcessed(command_id)) {
      throw new Error(`Command ${command_id} already processed`);
    }

    this.processedCommands.set(command_id, {
      command_id,
      command_type,
      processed_at: new Date(),
      result_event_id,
    });
  }

  /**
   * Get count of processed commands.
   * 
   * @returns Number of processed commands
   */
  count(): number {
    return this.processedCommands.size;
  }

  /**
   * Clear all processed commands (for testing).
   */
  clear(): void {
    this.processedCommands.clear();
  }
}

// Global singleton instance
let globalStore: CommandIdempotencyStore | null = null;

/**
 * Get global command idempotency store.
 * 
 * @returns Global store instance
 */
export function getCommandIdempotencyStore(): CommandIdempotencyStore {
  if (!globalStore) {
    globalStore = new CommandIdempotencyStore();
  }
  return globalStore;
}
