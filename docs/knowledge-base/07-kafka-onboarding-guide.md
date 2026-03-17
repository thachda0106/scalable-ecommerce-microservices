# Kafka Onboarding Guide: Zero to Production

Welcome to the team. This guide is designed to accelerate your onboarding into our event-driven microservices architecture. If you're coming from a background of REST APIs or traditional message queues like RabbitMQ, Kafka requires a fundamental shift in your mental model.

As a Senior Engineer, you don't just need to know *how* to use Kafka; you need to understand *why* it behaves the way it does, how we use it in production, and the trade-offs involved.

---

## 1. What is Kafka (For the Senior Mindset)

At its core, **Kafka is not a message queue; it is a distributed commit log.**

Traditional message queues (like ActiveMQ or RabbitMQ) are designed around the concept of "smart broker, dumb consumer." The broker tracks who has read what, routes messages, and deletes them once they are acknowledged.

Kafka flips this: **"Dumb broker, smart consumer."**
- Kafka simple appends messages to an immutable log on disk.
- It doesn't track per-message acknowledgements for each consumer.
- Consumers maintain their own "pointer" (offset) in the log.
- Messages are **not deleted** when read. They are retained for a configurable period (e.g., 7 days), allowing consumers to replay history.

### Why does Kafka exist?
To solve two massive problems:
1. **High Throughput / Scalability:** Writing sequentially to disk (append-only) is blazing fast. Kafka can handle millions of messages per second.
2. **Decoupling (Real Pub/Sub):** Because messages aren't deleted upon being read, you can have 10 different services reading the exact same event at different speeds without impacting each other or the broker.

### When NOT to use Kafka
- **Task Queues:** If you need features like delayed execution (run this job in 5 minutes), complex routing, or individual message retries (DLQ per message out of order), Kafka is the wrong tool. Use SQS, Redis BullMQ, or RabbitMQ.
- **Request/Reply:** Using Kafka for synchronous RPC calls is an anti-pattern. If Service A needs an immediate answer from Service B to respond to the user, use HTTP/gRPC.

---

## 2. Core Concepts (Deep but Practical)

Forget everything you know about AMQP exchanges and queues. Kafka has its own primitives.

### Topic
A logical name for a stream of records (e.g., `order.events`). Think of it as a category or a folder.

### Partition (⚠️ VERY IMPORTANT)
This is where Kafka's scalability and ordering guarantees live. A topic is broken down into *partitions*.
- An event is appended to a specific partition within a topic.
- A partition is a strictly ordered sequence of records.
- **Ordering is ONLY guaranteed WITHIN a partition, NEVER across the whole topic.**

How does Kafka choose the partition? By hashing the **Partition Key** you provide (e.g., `orderId`). 
```text
Topic: order.events (3 Partitions)

Partition 0: [Msg1(id:5)] -> [Msg4(id:8)]
Partition 1: [Msg2(id:9)] -> [Msg5(id:2)]
Partition 2: [Msg3(id:1)] -> [Msg6(id:11)]
```
*If you don't provide a key, messages are distributed Round-Robin (breaking ordering guarantees).*

### Offset
The sequential ID number given to a message in a partition. Consumers use the offset to track where they are. If a consumer crashes, it asks Kafka: "What was the last offset I committed for Partition 2?" and resumes from there.

### Producer / Consumer
- **Producer:** The service publishing data to the topic.
- **Consumer:** The service reading data from the topic.

### Consumer Group
This is how Kafka scales consumption. 
If `inventory-service` needs to read `order.events`, you start multiple instances of `inventory-service` and assign them the **same Consumer Group ID** (e.g., `inventory-service-group`).
- Kafka will divide the partitions among the consumers in the group. 
- **Rule of thumb:** 1 Partition can only be read by 1 Consumer in a group at a time.
- If you have 3 partitions and 4 consumers, 1 consumer will sit idle!

### Broker & Replication
A Kafka cluster consists of multiple servers called **Brokers**. To prevent data loss, partitions are replicated across brokers. The `Leader` handles all reads and writes, while `Followers` passively copy data.

---

## 3. Kafka in THIS PROJECT

In our ecommerce system, we use Kafka primarily for **Choreography (Event-Driven Integration)** and **CQRS state propagation**.

### Example Flow: The Order Saga
When a user places an order, we do not want the `order-service` to synchronously call `inventory` and `payment` via HTTP HTTP—if payment is slow, the user has a bad experience; if payment is down, the order drops.

Instead, we use events:

1. **Flow 1: Order Creation**
   - **Producer:** `order-service` (saves order to DB, publishes `order.created` event via Transactional Outbox).
   - **Consumer 1:** `inventory-service`. It listens, reserves stock, and publishes `inventory.reserved` or `inventory.failed`.
   - **Consumer 2:** `payment-service`. It listens, waits for `inventory.reserved` (or just processes payment immediately depending on our strict saga flow), and charges the card. It publishes `payment.completed` or `payment.failed`.

2. **Flow 2: Notification & Reporting**
   - **Producer:** `payment-service` publishes `payment.completed`.
   - **Consumer:** `notification-service`. It listens, sends an email to the user. (Note: Email sending is slow! Because it's a separate consumer group, it doesn't block the `order-service` or `inventory-service`!).

### Why Event-Driven?
- **Resilience:** If `notification-service` is down for 3 hours, Kafka simply holds onto the `payment.completed` events. When it comes back online, it resumes from its last offset. No data lost, no complex retry logic needed in the producer.
- **Temporal Decoupling:** `order-service` doesn't need to know `notification-service` even exists.

---

## 4. Local Setup with Docker

We use modern Kafka without Zookeeper (KRaft mode) for local dev.

Create a `docker-compose.kafka.yml`:

```yaml
version: '3.8'

services:
  kafka:
    image: bitnami/kafka:3.5
    ports:
      - "9092:9092"
      - "9094:9094"
    environment:
      # Use KRaft (no Zookeeper)
      - KAFKA_CFG_NODE_ID=1
      - KAFKA_CFG_PROCESS_ROLES=controller,broker
      - KAFKA_CFG_CONTROLLER_QUORUM_VOTERS=1@kafka:9093
      - KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:9094
      - KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094
      - KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
      - KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_CFG_INTER_BROKER_LISTENER_NAME=PLAINTEXT
      - KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=true
    volumes:
      - kafka_data:/bitnami/kafka

  # Kafdrop UI - for visually inspecting topics and messages
  kafdrop:
    image: obsidiandynamics/kafdrop:latest
    ports:
      - "9000:9000"
    environment:
      KAFKA_BROKERCONNECT: "kafka:9092"
    depends_on:
      - kafka

volumes:
  kafka_data:
```

**Commands:**
- Start: `docker-compose -f docker-compose.kafka.yml up -d`
- UI: Open `http://localhost:9000` to see your clusters, topics, and browse messages.

---

## 5. Hands-on Code (NestJS)

We use the official NestJS Microservices package which wraps `kafkajs`.

### Setup in your Service (e.g., `main.ts`)
```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'order-service',
      brokers: ['localhost:9094'], // use external port for local host
    },
    consumer: {
      groupId: 'order-consumer-group',
    },
  },
});
await app.listen();
```

### The Producer
To send an event, we inject the `ClientKafka`.

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class OrderPublisher {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka) {}

  async publishOrderCreated(orderId: string, amount: number) {
    const payload = {
      orderId,
      amount,
      timestamp: new Date().toISOString(),
    };

    // We MUST use orderId as the key to guarantee ordering per order!
    this.kafkaClient.emit('order.events', {
      key: orderId,
      value: payload,
    });
  }
}
```

### The Consumer
NestJS makes consuming incredibly declarative.

```typescript
import { Controller } from '@nestjs/common';
import { EventPattern, Payload, Ctx, KafkaContext } from '@nestjs/microservices';

@Controller()
export class PaymentConsumer {
  
  @EventPattern('order.events')
  async handleOrderCreated(@Payload() message: any, @Ctx() context: KafkaContext) {
    const originalMessage = context.getMessage();
    const partition = context.getPartition();
    const topic = context.getTopic();
    
    console.log(`Received Order: ${message.orderId} from Partition: ${partition}`);
    
    try {
      // 1. Check idempotency (Has this orderId been processed?)
      // 2. Process Payment
      // 3. (NestJS auto-commits the offset if the promise resolves)
    } catch (error) {
      // Handle error (DLQ, manual retry, etc.)
      // Be careful: Throwing here might cause an infinite retry loop 
      // depending on consumer config!
    }
  }
}
```

---

## 6. Advanced Concepts (Production Mindset)

### Rebalancing
When you add or remove an instance of `order-service` to the Consumer Group, Kafka triggers a "Rebalance". It pauses consumption, re-assigns partitions among the existing instances, and resumes. 
*Impact:* This takes a few seconds. Do not scale up/down constantly. 

### At-Least-Once vs Exactly-Once Delivery
By default, Kafka guarantees **At-Least-Once Delivery**. Meaning, your consumer *will* receive the message, but in failure scenarios (network blip before commit, consumer crash during processing), it might receive it **twice**.
- *Can we configure Exactly-Once?* Yes, Kafka supports Transactions, but it is heavily complex and slow.
- *How we solve it:* We stick to At-Least-Once, and force **All Consumers to be Idempotent**.

### Idempotency (⚠️ VERY IMPORTANT)
Never assume you will process a message only once.
In your consumer logic, ALWAYS check your database before acting:
```typescript
const isProcessed = await db.processedEvents.findOne({ eventId: message.id });
if (isProcessed) return; // Skip
await processBusinessLogic();
await db.processedEvents.insert({ eventId: message.id }); // In same SQL transaction!
```

### Dead Letter Queue (DLQ)
If a message is structurally malformed (e.g., missing `amount`), retrying will never make it work. It blocks the partition.
You must catch the error, publish the bad message to a `topic-name.dlq`, and commit the offset to move past it.

---

## 7. Common Pitfalls (From the trenches)

1. **Ordering Broken by Missing Keys:** Publishing to Kafka without providing a `key` (like `userId` or `orderId`). Messages for the same user scatter across 10 partitions. Updates overwrite out of order. Disaster.
2. **Long-Running Consumers Causing Kicks:** If your consumer does heavy DB work (e.g., 5 minutes) without polling Kafka, Kafka assumes the consumer died, kicks it out of the group, and triggers a rebalance. (Look up `max.poll.interval.ms`).
3. **Poison Pills:** A consumer crashes on an unhandled exception, restarts, pulls the *same uncommitted message*, and crashes again. Endlessly. Always wrap consumer logic in `try/catch` and route to DLQ for domain errors.
4. **Publishing BEFORE DB Commit:**
   ```typescript
   await db.orders.save(order);
   kafka.emit('order.created', order); // CRASH HERE = INCONSISTENT DATA
   ```
   *Solution:* Use the **Transactional Outbox Pattern** (save the event to a DB table in the same transaction, use a separate worker/CDC like Debezium to publish to Kafka).

---

## 8. Compare Kafka vs RabbitMQ (Mapping Concepts)

If you know RabbitMQ, unlearn the routing logic. Kafka does routing purely via Consumer logic.

### Direct Exchange (RabbitMQ: 1 Queue, 1 Worker)
- **Kafka Equivalent:** 1 Topic, 1 Consumer Group (with multiple instances).
- *Scenario:* `order.created` needs to be processed by `payment-service`. The event goes sideways to the instances in `payment-consumer-group`. Only 1 instance handles it.

### Topic Exchange (RabbitMQ: Routing Keys like `us.payment.*`)
- **Kafka Equivalent:** Kafka doesn't have native wildcard routing. You either:
  1. Produce to specific topics (`payments.us`, `payments.eu`)
  2. Produce to `payments` and let consumers filter the payload (`if (msg.region !== 'us') return;`). 
  *Because consumers don't delete messages, filtering is cheap.*

### Fanout Exchange (RabbitMQ: Broadcast to everyone)
- **Kafka Equivalent:** Same Topic, **Different Consumer Groups**.
- *Scenario:* `order.created` published once.
  - `inventory-service` listens using `"group-id": "inventory"`.
  - `notification-service` listens using `"group-id": "notification"`.
  Kafka ensures *both* groups get a dedicated copy of the event (independent offsets).

---

## 9. Best Practices for THIS PROJECT

1. **Topic Naming Convention:** `<domain>.<entity>.<action>` (e.g., `ecommerce.order.created`).
2. **Event Schema:** Every event MUST have an `eventId` (UUID), a `timestamp`, a `type`, and the `payload`.
3. **Versioning:** Never introduce breaking changes to an event schema. Always ADD fields, never RENAME or DELETE. If drastic changes are needed, publish to a new topic (`order.events.v2`).
4. **Correlation IDs:** Always carry the `correlationId` (from the HTTP request header) inside your Kafka message headers and pass it down. This is the only way to trace an order through 5 microservices in OpenTelemetry/Datadog.

---

## 10. Mental Model Upgrade (Senior → Tech Lead)

As a technical leader, you must know when Kafka becomes a liability.

- **Kafka is heavy infrastructure.** It requires JVM tuning, disk I/O management, and ZooKeeper/KRaft quorum. Do not introduce Kafka just to connect two services. Use HTTP first. Use Kafka when you need decoupling and replayability.
- **Microservices are not about technology; they are about organizational scaling.** Event contracts (schemas) become public APIs. If `order-service` changes the shape of `order.created`, they break 5 other teams. Treat schema changes like breaking external API changes.
- **Observability is mandatory.** In a REST system, a 500 error is immediately visible. In Kafka, if a consumer group dies, the system returns 200 OK (producer success), but emails stop sending. You must alert on **Consumer Lag** (the gap between the latest offset and the consumer's offset). If Lag > 1000, page the team.

Welcome aboard. Read the code, break things locally, and review our Outbox relay implementation.
