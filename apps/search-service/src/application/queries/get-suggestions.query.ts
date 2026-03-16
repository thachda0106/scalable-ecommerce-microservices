export class GetSuggestionsQuery {
  constructor(
    public readonly prefix: string,
    public readonly limit: number = 10,
  ) {}
}
