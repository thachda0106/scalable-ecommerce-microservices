import { DomainException } from './domain-exception';

export class VersionConflictException extends DomainException {
  public readonly code = 'VERSION_CONFLICT';

  constructor(public readonly userId: string) {
    super(
      `Cart for user ${userId} was modified concurrently. Please retry the operation.`,
    );
  }
}
