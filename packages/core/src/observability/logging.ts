import { LoggerModule } from "nestjs-pino";

export const getLoggerModule = () => {
  return LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.NODE_ENV !== "production" ? "debug" : "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
      messageKey: "message", // Datadog/CloudWatch standard
    },
  });
};
