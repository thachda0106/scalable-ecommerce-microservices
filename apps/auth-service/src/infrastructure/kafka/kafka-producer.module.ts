import { Module, Global } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';

export const KAFKA_SERVICE = 'KAFKA_SERVICE';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: KAFKA_SERVICE,
        useFactory: () => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'auth-service',
              brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(
                ',',
              ),
            },
            producer: {
              createPartitioner: Partitioners.LegacyPartitioner, // Prevent breaking changes on NestJS/KafkaJS
            },
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class KafkaProducerModule {}
