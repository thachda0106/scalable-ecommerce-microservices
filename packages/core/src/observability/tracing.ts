import { getLogger } from './logging';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const logger = getLogger('Tracing');

let sdk: NodeSDK | null = null;

export const initTracing = (serviceName: string) => {
  if (sdk) return;

  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as {
    OTLPTraceExporter: new (config: Record<string, unknown>) => { export: (spans: unknown[]) => void; shutdown: () => Promise<void> };
  };

  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
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
};

export const shutdownTracing = async (): Promise<void> => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    logger.log('Tracing terminated');
  } catch (error) {
    logger.error('Error terminating tracing', error);
  }
};
