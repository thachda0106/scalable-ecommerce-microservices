import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly client: Client;
  private readonly logger = new Logger(OpenSearchService.name);

  constructor() {
    const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';
    const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || 'admin';
    const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || 'admin';

    this.client = new Client({
      node: OPENSEARCH_URL,
      auth: {
        username: OPENSEARCH_USERNAME,
        password: OPENSEARCH_PASSWORD,
      },
      ssl: {
        rejectUnauthorized: false, // For local development only!
      },
    });
  }

  async onModuleInit() {
    await this.initializeIndices();
  }

  async initializeIndices() {
    const indexName = 'products';
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      if (!exists.body) {
        this.logger.log(`Index ${indexName} does not exist. Creating...`);
        await this.client.indices.create({
          index: indexName,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                name: { type: 'text' },
                description: { type: 'text' },
                price: { type: 'float' },
                status: { type: 'keyword' },
              },
            },
          },
        });
        this.logger.log(`Index ${indexName} created successfully.`);
      } else {
        this.logger.log(`Index ${indexName} already exists.`);
      }
    } catch (error) {
      this.logger.error(`Error initializing OpenSearch indices: ${error.message}`);
    }
  }

  getClient(): Client {
    return this.client;
  }
}
