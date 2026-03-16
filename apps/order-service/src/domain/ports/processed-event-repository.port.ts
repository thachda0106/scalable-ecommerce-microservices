export const PROCESSED_EVENT_REPOSITORY = Symbol('PROCESSED_EVENT_REPOSITORY');

export interface IProcessedEventRepository {
  exists(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, eventType: string): Promise<void>;
}
