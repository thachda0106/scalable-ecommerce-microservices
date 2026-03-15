export class StockInvariantViolationError extends Error {
  constructor(
    public readonly productId: string,
    public readonly details: string,
  ) {
    super(`Stock invariant violation for product ${productId}: ${details}`);
    this.name = 'StockInvariantViolationError';
  }
}
