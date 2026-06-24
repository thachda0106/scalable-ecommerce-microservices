import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogOrmEntity } from '../persistence/entities/audit-log.orm-entity';

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
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @InjectRepository(AuditLogOrmEntity)
    private readonly auditRepo: Repository<AuditLogOrmEntity>,
  ) {}

  log(entry: AuditEntry): void {
    // Structured console log for log aggregation
    this.logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }),
    );

    // Persist to database (fire-and-forget to avoid blocking the main flow)
    const entity = new AuditLogOrmEntity();
    entity.userId = entry.userId;
    entity.action = entry.action;
    entity.targetId = entry.targetId;
    entity.details = entry.details ?? {};
    this.auditRepo.save(entity).catch((err) => {
      this.logger.error(
        `Failed to persist audit log: ${(err as Error).message}`,
      );
    });
  }
}
