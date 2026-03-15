/**
 * Base class for all domain-layer exceptions.
 * Infrastructure/interface layers map these to HTTP status codes.
 */
export abstract class DomainException extends Error {
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
