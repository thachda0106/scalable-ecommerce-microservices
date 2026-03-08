import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

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
    console.log(`OpenTelemetry tracing initialized for ${serviceName}`);
  } catch (error) {
    console.error('Error initializing tracing', error);
  }

  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};
