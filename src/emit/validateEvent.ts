/**
 * Emit-side schema validation for payment events.
 * 
 * Ensures no event can be emitted unless it validates against
 * the canonical JSON Schema.
 * 
 * This turns schemas into hard law, not documentation.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

// Load all schemas from schemas directory
const schemaDir = path.resolve(__dirname, "../../schemas");

// Register all schemas with AJV
const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith('.json'));
schemaFiles.forEach((file) => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(schemaDir, file), "utf-8")
  );
  ajv.addSchema(schema, file);
});

/**
 * Validate an event against its JSON schema.
 * 
 * @param event - Event object to validate
 * @throws Error if event is invalid or schema is missing
 */
export function validateEvent(event: any): void {
  if (!event || typeof event !== 'object') {
    throw new Error('Event must be an object');
  }

  if (!event.event_type) {
    throw new Error('Event missing event_type field');
  }

  // Map event_type to schema filename
  // PaymentSettled → payment_settled.v1.json
  const schemaName = `${toSnakeCase(event.event_type)}.v1.json`;
  const validate = ajv.getSchema(schemaName);

  if (!validate) {
    throw new Error(`No schema registered for ${event.event_type} (expected ${schemaName})`);
  }

  if (!validate(event)) {
    const errors = ajv.errorsText(validate.errors);
    throw new Error(
      `Schema violation for ${event.event_type}: ${errors}`
    );
  }
}

/**
 * Convert PascalCase to snake_case.
 * 
 * @param str - PascalCase string
 * @returns snake_case string
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Get list of supported event types.
 * 
 * @returns Array of supported event type names
 */
export function getSupportedEventTypes(): string[] {
  return schemaFiles
    .filter(f => f !== 'envelope.v1.json')
    .map(f => {
      // payment_settled.v1.json → PaymentSettled
      const name = f.replace('.v1.json', '');
      return toPascalCase(name);
    });
}

/**
 * Convert snake_case to PascalCase.
 * 
 * @param str - snake_case string
 * @returns PascalCase string
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
