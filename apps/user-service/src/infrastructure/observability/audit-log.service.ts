import { Injectable, Logger } from '@nestjs/common';

export interface AuditEntry {
  userId: string;
  action: string;
  targetId: string;
  details?: Record<string, unknown>;
  previousValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLog');

  log(entry: AuditEntry): void {
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }),
    );
  }
}
