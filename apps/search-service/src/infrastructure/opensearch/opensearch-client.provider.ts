import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

export const OPENSEARCH_CLIENT = Symbol('OPENSEARCH_CLIENT');

export const openSearchClientProvider: Provider = {
  provide: OPENSEARCH_CLIENT,
  useFactory: (configService: ConfigService): Client => {
    const url = configService.get<string>(
      'OPENSEARCH_URL',
      'http://localhost:9200',
    );
    const username = configService.get<string>('OPENSEARCH_USERNAME', 'admin');
    const password = configService.get<string>('OPENSEARCH_PASSWORD', 'admin');
    const sslVerify = configService.get<string>(
      'OPENSEARCH_SSL_VERIFY',
      'false',
    );

    return new Client({
      node: url,
      auth: { username, password },
      ssl: { rejectUnauthorized: sslVerify === 'true' },
    });
  },
  inject: [ConfigService],
};
