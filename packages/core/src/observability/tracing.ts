import { Logger } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const logger = new Logger('Tracing');

let sdk: NodeSDK | null = null;

export const initTracing = (serviceName: string) => {
  if (sdk) return;

  sdk = new NodeSDK({
    traceExporter: new (require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter)({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
    serviceName,
  });

  try {
    sdk.start();
    logger.log(`OpenTelemetry tracing initialized for ${serviceName}`);
  } catch (error) {
    logger.error('Error initializing tracing', error);
  }

  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => logger.log('Tracing terminated'))
      .catch((error) => logger.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};
