export class ReservationNotFoundError extends Error {
  constructor(
    public readonly referenceId: string,
    public readonly productId?: string,
  ) {
    super(
      `Reservation not found for reference ${referenceId}${productId ? ` product ${productId}` : ''}`,
    );
    this.name = 'ReservationNotFoundError';
  }
}
