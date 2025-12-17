/**
 * Event emission guard.
 * 
 * The ONLY way to emit events from turing-payments-rails.
 * Enforces schema validation before emission.
 * 
 * Rule: If validation fails, the event must not leave the process.
 */

import { validateEvent } from "./validateEvent";

/**
 * Event publisher interface.
 * Implement this to connect to your event bus (Kafka, RabbitMQ, etc.)
 */
export interface EventPublisher {
  publish(event: any): Promise<void>;
}

// Global publisher instance (set via setPublisher)
let publisher: EventPublisher | null = null;

/**
 * Set the event publisher implementation.
 * 
 * @param impl - EventPublisher implementation
 */
export function setPublisher(impl: EventPublisher): void {
  publisher = impl;
}

/**
 * Emit an event (with mandatory schema validation).
 * 
 * @param event - Event object to emit
 * @throws Error if validation fails or publisher not set
 */
export async function emitEvent(event: any): Promise<void> {
  // Step 1: Validate against schema (MANDATORY)
  validateEvent(event);

  // Step 2: Only here do we actually publish the event
  if (!publisher) {
    throw new Error('Event publisher not configured. Call setPublisher() first.');
  }

  await publisher.publish(event);
}

/**
 * Emit multiple events in sequence (with validation).
 * 
 * @param events - Array of events to emit
 * @throws Error if any validation fails
 */
export async function emitEvents(events: any[]): Promise<void> {
  for (const event of events) {
    await emitEvent(event);
  }
}
