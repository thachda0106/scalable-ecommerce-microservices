import { z } from 'zod';

/**
 * Base event envelope schema — all domain events must conform to this shape.
 * Used for runtime validation at consumer boundaries.
 */
export const EventEnvelopeSchema = z.object({
  type: z.string(),
  schemaVersion: z.number().int().positive(),
  source: z.string(),
  correlationId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
