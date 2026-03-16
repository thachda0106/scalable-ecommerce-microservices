import { randomUUID } from 'crypto';

/**
 * Extracts correlationId from Kafka message headers.
 * Falls back to generating a new UUID if not present.
 */
export function getCorrelationId(
  headers?: Record<string, Buffer | string | undefined>,
): string {
  if (!headers) return randomUUID();

  const raw = headers['x-correlation-id'];
  if (raw) {
    return Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw;
  }
  return randomUUID();
}

/**
 * Creates Kafka message headers with the given correlationId.
 * Use when producing Kafka events to propagate traceability.
 */
export function setCorrelationHeaders(
  correlationId: string,
): Record<string, string> {
  return {
    'x-correlation-id': correlationId,
  };
}
