export class SearchException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchException';
  }
}
