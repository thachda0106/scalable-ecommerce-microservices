export class GetUsersQuery {
  constructor(
    public readonly page?: number,
    public readonly limit?: number,
    public readonly status?: string,
  ) {}
}
