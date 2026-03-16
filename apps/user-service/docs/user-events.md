# User Events

The `user-service` is an event publisher in the event-driven architecture of the platform. It publishes domain events when significant changes occur to the user's state.

These events allow other microservices (e.g., order-service, notification-service) to react to user changes asynchronously.

## Published Events

### `user.created`
- **Triggered When**: A new user account is successfully registered and persisted.
- **Purpose**: Informs downstream services that a new user exists. For instance, the notification-service might send a welcome email; a marketing service might add the user to a campaign.
- **Payload Data**: Typically includes the `userId`, `email`, and `username`.

### `user.updated`
- **Triggered When**: The user modifies their core details, profile, or settings.
- **Purpose**: Keeps dependent services synchronized with the latest user information. If a user changes their preferred language, the notification-service needs to know to localize future templates.
- **Payload Data**: Includes the `userId` and a record of the `changedFields` to allow consumers to determine if they need to act on the event.

### `user.deleted`
- **Triggered When**: A user account is soft-deleted (closed) from the platform.
- **Purpose**: Signals other services to clean up or anonymize user-related data to comply with data retention and privacy policies (e.g., GDPR), and to prevent new transactions from being initiated for this user.
- **Payload Data**: Includes the `userId`.
