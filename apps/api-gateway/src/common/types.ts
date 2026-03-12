import type { Request } from 'express';

export interface GatewayRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roles: string[];
  };
}
