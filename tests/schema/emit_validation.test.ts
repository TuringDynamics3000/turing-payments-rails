/**
 * Emit-side schema validation tests.
 * 
 * Ensures invalid events are rejected before emission.
 * This is a CI gate - if this fails, no code ships.
 */

import { describe, test, expect } from 'vitest';
import { validateEvent } from '../../src/emit/validateEvent';

describe('Emit-side schema validation', () => {
  test('valid PaymentSettled event passes validation', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'PaymentSettled',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      causation_id: null,
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {
        payment_id: 'pay_123',
        attempt_id: 'att_001',
        external_ref: 'ext_ref_abc',
        settled_at: '2024-12-17T10:00:00Z',
        ledger_posting: {
          debit_account_id: 'acc_source',
          credit_account_id: 'acc_dest',
          amount: 100.00
        }
      }
    };

    expect(() => validateEvent(event)).not.toThrow();
  });

  test('invalid PaymentSettled event is rejected (missing ledger_posting)', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'PaymentSettled',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {
        payment_id: 'pay_123',
        attempt_id: 'att_001',
        external_ref: 'ext_ref_abc',
        settled_at: '2024-12-17T10:00:00Z'
        // Missing ledger_posting - INVALID
      }
    };

    expect(() => validateEvent(event)).toThrow(/Schema violation/);
  });

  test('invalid PaymentSettled event is rejected (negative amount)', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'PaymentSettled',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {
        payment_id: 'pay_123',
        attempt_id: 'att_001',
        external_ref: 'ext_ref_abc',
        settled_at: '2024-12-17T10:00:00Z',
        ledger_posting: {
          debit_account_id: 'acc_source',
          credit_account_id: 'acc_dest',
          amount: -100.00  // INVALID - must be positive
        }
      }
    };

    expect(() => validateEvent(event)).toThrow(/Schema violation/);
  });

  test('valid PaymentInitiated event passes validation', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'PaymentInitiated',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {
        payment_id: 'pay_123',
        rail: 'NPP',
        amount: 100.00,
        currency: 'AUD',
        source_account_id: 'acc_source',
        destination: {
          type: 'PAYID',
          value: 'user@example.com'
        }
      }
    };

    expect(() => validateEvent(event)).not.toThrow();
  });

  test('invalid PaymentInitiated event is rejected (invalid rail)', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'PaymentInitiated',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {
        payment_id: 'pay_123',
        rail: 'INVALID_RAIL',  // INVALID - not in enum
        amount: 100.00,
        currency: 'AUD',
        source_account_id: 'acc_source',
        destination: {
          type: 'PAYID',
          value: 'user@example.com'
        }
      }
    };

    expect(() => validateEvent(event)).toThrow(/Schema violation/);
  });

  test('event with missing event_type is rejected', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      // Missing event_type
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {}
    };

    expect(() => validateEvent(event)).toThrow(/missing event_type/i);
  });

  test('event with unsupported event_type is rejected', () => {
    const event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'UnsupportedEventType',
      event_version: 1,
      occurred_at: '2024-12-17T10:00:00Z',
      producer: 'turing-payments-rails',
      correlation_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'PAYMENT',
      entity_id: 'pay_123',
      payload: {}
    };

    expect(() => validateEvent(event)).toThrow(/No schema registered/);
  });
});
