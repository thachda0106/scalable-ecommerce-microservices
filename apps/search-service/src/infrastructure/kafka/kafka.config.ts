import { ConfigService } from '@nestjs/config';

export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  groupId: string;
}

export function createKafkaConfig(configService: ConfigService): KafkaConfig {
  const brokersStr = configService.get<string>(
    'KAFKA_BROKERS',
    'localhost:29092',
  );
  return {
    clientId: 'search-service',
    brokers: brokersStr.split(','),
    groupId: configService.get<string>(
      'KAFKA_GROUP_ID',
      'search-service-product-sync',
    ),
  };
}
