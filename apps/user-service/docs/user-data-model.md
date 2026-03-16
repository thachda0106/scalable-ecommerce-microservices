# User Data Model

The user-service manages the data necessary to represent a user within the system. To maintain clean boundaries and performance, the user concept is broken down into specific models within the domain.

## User
The `User` is the aggregate root. It maintains the core identity and the consistent state boundaries.
- **Identity**: Uniquely identifies the account (e.g., `id`, `email`, `username`).
- **State/Status**: Tracks the lifecycle state of the account (`ACTIVE`, `SUSPENDED`, `DELETED`).
- **Audit**: Tracks creation time (`createdAt`) and handles versioning for optimistic concurrency.
- Controls access to updating the profile and settings.

## UserProfile
The `UserProfile` contains the semi-public and personal information associated with the user account. Changes to profile data do not impact the core authentication or lifecycle of the User.
- **Personal Details**: `displayName`, `bio`, `dateOfBirth`.
- **Media**: `avatar` URL.
- **Contact**: `phoneNumber` (distinct from the primary email used for login/identity).

## UserSettings
The `UserSettings` entity stores application-specific preferences for the user, controlling how the platform behaves for them.
- **Notifications**: Preferences for receiving alerts (`emailNotifications`, `pushNotifications`, `smsNotifications`).
- **Localization**: Settings for user experience (`language`, `timezone`).
