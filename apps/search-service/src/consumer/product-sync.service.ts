import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { OpenSearchService } from '../opensearch/opensearch.service';

@Injectable()
export class ProductSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductSyncService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly openSearchService: OpenSearchService) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'search-service-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = this.kafka.consumer({ groupId: 'search-service-product-sync' });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'product.events', fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;
        
        try {
          const event = JSON.parse(message.value.toString());
          await this.handleEvent(event);
        } catch (error) {
          this.logger.error(`Error processing message from partition ${partition}: ${error.message}`);
        }
      },
    });

    this.logger.log('Kafka Consumer connected and listening to product.events');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleEvent(event: any) {
    const { type, payload } = event;
    const client = this.openSearchService.getClient();

    try {
      switch (type) {
        case 'ProductCreated':
        case 'ProductUpdated':
          await client.index({
            index: 'products',
            id: payload.id,
            body: {
              id: payload.id,
              name: payload.name,
              description: payload.description,
              price: payload.price,
              status: payload.status,
            },
            refresh: true, // For real-time search immediately after sync
          });
          this.logger.log(`Synced product ${payload.id} to OpenSearch`);
          break;
        case 'ProductDeleted':
          await client.delete({
            index: 'products',
            id: payload.id,
            refresh: true,
          });
          this.logger.log(`Deleted product ${payload.id} from OpenSearch`);
          break;
        default:
          this.logger.warn(`Unknown event type: ${type}`);
      }
    } catch (err) {
      if (err.meta && err.meta.statusCode === 404 && type === 'ProductDeleted') {
         // ignore 404 on delete
      } else {
         throw err;
      }
    }
  }
}
