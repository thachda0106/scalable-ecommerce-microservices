# User Service

## Service Overview
The `user-service` is a microservice responsible for managing user-related data within the application ecosystem. It acts as the central source of truth for user identities, their profiles, settings, and monitors their lifecycle within the platform.

## User Management Responsibilities
The user-service manages:
- **User accounts**: Core identity information.
- **User profiles**: Public and semi-public information about the user (e.g., display name, bio, avatar).
- **User settings**: Preferences and configurations specific to the user (e.g., notification preferences, language).
- **User lifecycle**: State management of the user from creation to suspension or deletion.

## Architecture Overview
The service is built using **Domain-Driven Design (DDD)** and **Clean Architecture** patterns. It enforces a strict separation of concerns, ensuring that the core business domain is isolated from infrastructure and interface concerns.

## Folder Structure
```
user-service/
├── docs/                 # Service documentation
├── src/
│   ├── domain/           # Enterprise & business logic, entities, value objects
│   ├── application/      # Use cases, commands, queries, handlers
│   ├── infrastructure/   # External agencies, databases, message brokers
│   └── interfaces/       # Delivery mechanisms, controllers, DTOs
├── .env.example          # Environment variable template
└── README.md             # This file
```

## User Lifecycle
The lifecycle of a user within the system follows distinct states:
- `ACTIVE`: The default state upon creation. User can perform all operations.
- `SUSPENDED`: Applied administratively. User access is restricted.
- `DELETED`: Terminal state (soft-deletion). User data is retained but the account is inactive.

Transitions between these states emit domain events (`user.created`, `user.suspended`, `user.reactivated`, `user.deleted`).

## API Overview
The service exposes a REST API for interacting with the user data:
- `POST /users` - Create a new user
- `GET /users` - List users
- `GET /users/:id` - Get a specific user
- `PATCH /users/:id` - Update core user details
- `DELETE /users/:id` - Soft-delete a user
- `PATCH /users/:id/profile` - Update user profile
- `PATCH /users/:id/settings` - Update user settings
- `POST /users/:id/suspend` - Suspend a user
- `POST /users/:id/reactivate` - Reactivate a user

## Setup Instructions

1. Clone the repository and navigate to the `user-service` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in the required values.
4. Start the application:
   ```bash
   # Development
   npm run start:dev
   # Production
   npm run start:prod
   ```

## Environment Variables
See the `.env.example` file for a complete list of required configuration variables, which include App/Port, Database, Redis, and JWT settings.

## Testing
Run the test suites using the following commands:
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e
```
