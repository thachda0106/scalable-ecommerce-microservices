import { Logger } from '@nestjs/common';

/**
 * Lightweight environment variable validation.
 * Ensures required variables are present at startup.
 * Use Zod for full schema validation; this utility provides a zero-dependency
 * start by checking existence of critical vars and warning on optional ones.
 */
export interface EnvVarDescriptor {
  name: string;
  required?: boolean;
  fallback?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const logger = new Logger('EnvValidator');

export function validateEnv(
  vars: EnvVarDescriptor[],
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of vars) {
    const value = process.env[v.name];

    if (!value || value.trim() === '') {
      if (v.required) {
        errors.push(`Missing required env var: ${v.name}`);
      } else {
        warnings.push(`Optional env var ${v.name} is not set`);
      }
    }
  }

  if (errors.length > 0) {
    logger.error(`Environment validation failed: ${errors.join('; ')}`);
  }
  if (warnings.length > 0) {
    logger.warn(`Environment warnings: ${warnings.join('; ')}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates and returns a required environment variable.
 * Throws if not set (use at startup, not runtime).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Returns an environment variable or a fallback default.
 */
export function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

/**
 * Common env vars required by every service.
 */
export const COMMON_ENV_VARS: EnvVarDescriptor[] = [
  { name: 'NODE_ENV', required: false, fallback: 'development' },
  { name: 'INTERNAL_AUTH_SECRET', required: true },
];
