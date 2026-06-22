import { createHmac, timingSafeEqual } from 'crypto';

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes — replay protection window

/**
 * Signs internal headers for service-to-service authentication.
 * The API gateway calls this before forwarding requests to downstream services.
 *
 * @param userId - The authenticated user's ID
 * @param roles - The user's roles
 * @param secret - Shared INTERNAL_AUTH_SECRET env var
 * @returns Headers to add to the forwarded request
 */
export function signInternalHeaders(
  userId: string,
  roles: string[],
  secret: string,
): Record<string, string> {
  const timestamp = Date.now().toString();
  const rolesStr = roles.join(',');
  const data = `${userId}:${rolesStr}:${timestamp}`;
  const signature = createHmac('sha256', secret).update(data).digest('hex');

  return {
    'x-user-id': userId,
    'x-user-roles': rolesStr,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signature,
  };
}

/**
 * Verifies HMAC-signed internal headers from the API gateway.
 * Downstream services use this to reject forged identity headers.
 *
 * @param headers - The incoming request headers
 * @param secret - Shared INTERNAL_AUTH_SECRET env var
 * @returns true if signature is valid and timestamp is within tolerance
 */
export function verifyInternalHeaders(
  headers: Record<string, string | undefined>,
  secret: string,
): boolean {
  const userId = headers['x-user-id'];
  const userRoles = headers['x-user-roles'] || '';
  const timestamp = headers['x-internal-timestamp'];
  const signature = headers['x-internal-signature'];

  if (!userId || !timestamp || !signature) {
    return false;
  }

  // Check timestamp freshness (replay protection)
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > TIMESTAMP_TOLERANCE_MS) {
    return false;
  }

  // Verify HMAC signature (userId:roles:timestamp)
  const expectedData = `${userId}:${userRoles}:${timestamp}`;
  const expectedSignature = createHmac('sha256', secret).update(expectedData).digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  } catch {
    return false;
  }
}
