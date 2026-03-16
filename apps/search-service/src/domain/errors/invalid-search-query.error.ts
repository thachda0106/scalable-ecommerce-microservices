import { SearchException } from './search-exception';

export class InvalidSearchQueryError extends SearchException {
  constructor(reason: string) {
    super(`Invalid search query: ${reason}`);
    this.name = 'InvalidSearchQueryError';
  }
}
