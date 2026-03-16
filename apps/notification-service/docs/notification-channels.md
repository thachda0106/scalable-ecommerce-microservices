# Notification Channels

## Overview

The notification-service supports multiple delivery channels through the **Provider abstraction pattern**. Each channel has a dedicated provider class that implements a common interface, and the `ChannelProviderFactory` routes notifications to the correct provider at runtime.

---

## Supported Channels

| Channel | Enum Value | Provider | External Service |
|---|---|---|---|
| Email | `EMAIL` | `SendGridEmailProvider` | SendGrid API |
| SMS | `SMS` | `TwilioSmsProvider` | Twilio API |
| Push Notification | `PUSH` | `FirebasePushProvider` | Firebase Cloud Messaging |
| In-App | `IN_APP` | `InAppProvider` | Internal (logged) |

---

## Channel Provider Interface

Every channel provider implements the `IChannelProvider` interface:

```typescript
export interface IChannelProvider {
  readonly channel: NotificationChannel;
  send(payload: ChannelPayload): Promise<ChannelResult>;
}
```

### ChannelPayload

```typescript
interface ChannelPayload {
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientDeviceToken?: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}
```

### ChannelResult

```typescript
interface ChannelResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}
```

---

## Email Notifications

**Provider**: `SendGridEmailProvider`
**External Service**: [SendGrid](https://sendgrid.com/)

### Configuration

| Variable | Description |
|---|---|
| `SENDGRID_API_KEY` | SendGrid API key |
| `SMTP_FROM` | Default sender address |

### Behaviour

- Sends transactional emails using the SendGrid API
- Uses `recipientEmail` from the payload
- Returns `providerMessageId` on success

### Example Use Case

| Event | Template | Subject |
|---|---|---|
| `user.registered` | `user-registration` | "Welcome to our platform, {{userName}}!" |
| `order.created` | `order-confirmation` | "Order {{orderId}} Confirmed" |
| `order.paid` | `payment-receipt` | "Payment received for order {{orderId}}" |
| `order.shipped` | `shipping-update` | "Order {{orderId}} has been shipped" |
| `cart.abandoned` | `abandoned-cart` | "You left items in your cart" |

---

## SMS Notifications

**Provider**: `TwilioSmsProvider`
**External Service**: [Twilio](https://www.twilio.com/)

### Configuration

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Auth token |
| `TWILIO_FROM_NUMBER` | Sender phone number (E.164) |

### Behaviour

- Sends SMS messages via the Twilio API
- Uses `recipientPhone` from the payload
- Suitable for high-priority notifications (order confirmations, security alerts)

---

## Push Notifications

**Provider**: `FirebasePushProvider`
**External Service**: [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)

### Configuration

| Variable | Description |
|---|---|
| `FIREBASE_SERVER_KEY` | FCM server key |

### Behaviour

- Sends push notifications to mobile/web clients
- Uses `recipientDeviceToken` from the payload metadata
- Ideal for real-time alerts (shipping updates, promotions)

---

## In-App Notifications

**Provider**: `InAppProvider`
**External Service**: Internal

### Behaviour

- Stores notifications for retrieval via the application UI
- Currently implemented as a log-based provider (logs the notification and returns success)
- Future: integrate with a WebSocket gateway for real-time delivery, or write to a persistent in-app inbox

---

## Channel Provider Factory

The `ChannelProviderFactory` is the entry point for selecting a provider:

```typescript
@Injectable()
export class ChannelProviderFactory implements IChannelProviderFactory {
  private readonly providers: Map<NotificationChannel, IChannelProvider>;

  constructor(
    emailProvider: SendGridEmailProvider,
    smsProvider: TwilioSmsProvider,
    pushProvider: FirebasePushProvider,
    inAppProvider: InAppProvider,
  ) {
    this.providers = new Map([
      [NotificationChannel.EMAIL, emailProvider],
      [NotificationChannel.SMS,   smsProvider],
      [NotificationChannel.PUSH,  pushProvider],
      [NotificationChannel.IN_APP, inAppProvider],
    ]);
  }

  getProvider(channel: NotificationChannel): IChannelProvider {
    const provider = this.providers.get(channel);
    if (!provider) throw new InvalidChannelError(channel);
    return provider;
  }
}
```

---

## How to Add a New Channel

Adding a new notification channel (e.g., **WhatsApp**, **Slack**, **WebSocket**) requires three steps:

### Step 1: Add the Enum Value

```typescript
// src/domain/enums/notification-channel.enum.ts
export enum NotificationChannel {
  EMAIL   = 'EMAIL',
  SMS     = 'SMS',
  PUSH    = 'PUSH',
  IN_APP  = 'IN_APP',
  WHATSAPP = 'WHATSAPP',  // ← add new channel
}
```

### Step 2: Create the Provider

Create a new file in `src/infrastructure/providers/`:

```typescript
// src/infrastructure/providers/whatsapp.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import {
  IChannelProvider,
  ChannelPayload,
  ChannelResult,
} from '../../domain/ports/channel-provider.port';

@Injectable()
export class WhatsAppProvider implements IChannelProvider {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppProvider.name);

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    try {
      // Call WhatsApp Business API here
      this.logger.log(`Sending WhatsApp to ${payload.recipientPhone}`);
      return { success: true, providerMessageId: 'wa-msg-123' };
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }
  }
}
```

### Step 3: Register in the Module

1. **Add to `ChannelProviderFactory`** constructor:

```typescript
constructor(
  emailProvider: SendGridEmailProvider,
  smsProvider: TwilioSmsProvider,
  pushProvider: FirebasePushProvider,
  inAppProvider: InAppProvider,
  whatsappProvider: WhatsAppProvider,  // ← inject
) {
  this.providers = new Map([
    // ...existing entries
    [NotificationChannel.WHATSAPP, whatsappProvider],  // ← register
  ]);
}
```

2. **Add to `NotificationCoreModule` providers** in `notification.module.ts`:

```typescript
providers: [
  // ...existing providers
  WhatsAppProvider,
],
```

That's it! The new channel is immediately available for use with any notification command.

---

## Channel Selection

Channels are selected at **command creation time** — when the Kafka event controller or REST API creates a `SendNotificationCommand`, it specifies the `channel` parameter. This is an intentional design choice:

- **Event handlers** decide the channel based on the event type (e.g., `user.registered` → `EMAIL`)
- **REST API** accepts the channel from the request body
- **Future**: multi-channel support could send the same notification across multiple channels simultaneously
