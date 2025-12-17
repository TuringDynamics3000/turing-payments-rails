/**
 * Command idempotency tests.
 * 
 * Tests:
 * - Idempotency store operations
 * - CommandRejected emission
 * - Command handler idempotency enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandIdempotencyStore,
  getCommandIdempotencyStore,
} from '../../src/command/CommandIdempotencyStore';
import {
  CommandRejectedEmitter,
  RejectionReason,
} from '../../src/command/CommandRejectedEmitter';
import { CommandHandler, Command, CommandResult } from '../../src/command/CommandHandler';

describe('CommandIdempotencyStore', () => {
  let store: CommandIdempotencyStore;

  beforeEach(() => {
    store = new CommandIdempotencyStore();
  });

  it('should check if command is processed', () => {
    expect(store.isProcessed('cmd-001')).toBe(false);

    store.markProcessed('cmd-001', 'InitiatePayment');

    expect(store.isProcessed('cmd-001')).toBe(true);
  });

  it('should get command record', () => {
    store.markProcessed('cmd-002', 'InitiatePayment', 'evt-001');

    const record = store.getRecord('cmd-002');

    expect(record).toBeDefined();
    expect(record?.command_id).toBe('cmd-002');
    expect(record?.command_type).toBe('InitiatePayment');
    expect(record?.result_event_id).toBe('evt-001');
  });

  it('should throw error when marking duplicate command', () => {
    store.markProcessed('cmd-003', 'InitiatePayment');

    expect(() => {
      store.markProcessed('cmd-003', 'InitiatePayment');
    }).toThrow('already processed');
  });

  it('should count processed commands', () => {
    expect(store.count()).toBe(0);

    store.markProcessed('cmd-004', 'InitiatePayment');
    store.markProcessed('cmd-005', 'InitiatePayment');

    expect(store.count()).toBe(2);
  });

  it('should clear all processed commands', () => {
    store.markProcessed('cmd-006', 'InitiatePayment');
    expect(store.count()).toBe(1);

    store.clear();
    expect(store.count()).toBe(0);
  });
});

describe('CommandRejectedEmitter', () => {
  let emitter: CommandRejectedEmitter;

  beforeEach(() => {
    emitter = new CommandRejectedEmitter();
  });

  it('should emit CommandRejected for duplicate command', async () => {
    const event_id = await emitter.emitDuplicateCommand(
      'cmd-001',
      'InitiatePayment',
      'corr-001',
    );

    expect(event_id).toBeDefined();
    expect(event_id.length).toBeGreaterThan(0);
  });

  it('should emit CommandRejected for invalid schema', async () => {
    const event_id = await emitter.emitInvalidSchema(
      'cmd-002',
      'InitiatePayment',
      'Missing required field: amount',
      'corr-002',
    );

    expect(event_id).toBeDefined();
  });

  it('should emit CommandRejected for business rule violation', async () => {
    const event_id = await emitter.emitBusinessRuleViolation(
      'cmd-003',
      'InitiatePayment',
      'Payment amount exceeds daily limit',
      'corr-003',
    );

    expect(event_id).toBeDefined();
  });

  it('should emit CommandRejected for insufficient funds', async () => {
    const event_id = await emitter.emitInsufficientFunds(
      'cmd-004',
      'InitiatePayment',
      1000,
      500,
      'corr-004',
    );

    expect(event_id).toBeDefined();
  });

  it('should emit CommandRejected for invalid state transition', async () => {
    const event_id = await emitter.emitInvalidStateTransition(
      'cmd-005',
      'InitiatePayment',
      'Settled',
      'Initiate',
      'corr-005',
    );

    expect(event_id).toBeDefined();
  });
});

describe('CommandHandler', () => {
  // Test command handler implementation
  class TestCommandHandler extends CommandHandler<Command> {
    protected validate(command: Command): void {
      if (!command.command_id) {
        throw new Error('validation: Missing command_id');
      }
    }

    protected async execute(command: Command): Promise<string> {
      if (command.command_id === 'cmd-fail') {
        throw new Error('Business rule violation: Test failure');
      }
      return 'evt-success';
    }
  }

  let handler: TestCommandHandler;
  let store: CommandIdempotencyStore;

  beforeEach(() => {
    handler = new TestCommandHandler();
    store = getCommandIdempotencyStore();
    store.clear();
  });

  it('should process command successfully', async () => {
    const command: Command = {
      command_id: 'cmd-success',
      command_type: 'TestCommand',
    };

    const result = await handler.handle(command);

    expect(result.success).toBe(true);
    expect(result.event_id).toBe('evt-success');
    expect(store.isProcessed('cmd-success')).toBe(true);
  });

  it('should reject duplicate command', async () => {
    const command: Command = {
      command_id: 'cmd-duplicate',
      command_type: 'TestCommand',
    };

    // First execution succeeds
    const result1 = await handler.handle(command);
    expect(result1.success).toBe(true);

    // Second execution rejected
    const result2 = await handler.handle(command);
    expect(result2.success).toBe(false);
    expect(result2.rejection_event_id).toBeDefined();
    expect(result2.reason).toBe('Duplicate command');
  });

  it('should reject command with validation error', async () => {
    const command: Command = {
      command_id: '',
      command_type: 'TestCommand',
    };

    const result = await handler.handle(command);

    expect(result.success).toBe(false);
    expect(result.rejection_event_id).toBeDefined();
    expect(result.reason).toContain('validation');
  });

  it('should reject command with business rule violation', async () => {
    const command: Command = {
      command_id: 'cmd-fail',
      command_type: 'TestCommand',
    };

    const result = await handler.handle(command);

    expect(result.success).toBe(false);
    expect(result.rejection_event_id).toBeDefined();
    expect(result.reason).toContain('Business rule violation');
  });

  it('should not mark failed commands as processed', async () => {
    const command: Command = {
      command_id: 'cmd-fail-2',
      command_type: 'TestCommand',
    };

    await handler.handle(command);

    // Failed commands should NOT be marked as processed
    // (they can be retried)
    expect(store.isProcessed('cmd-fail-2')).toBe(false);
  });
});
