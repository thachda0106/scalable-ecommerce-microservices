import { LoggerModule, Logger as PinoLogger } from "nestjs-pino";
import pino from "pino";

const sharedPinoConfig: pino.LoggerOptions = {
  level: process.env.NODE_ENV !== "production" ? "debug" : "info",
  ...(process.env.NODE_ENV !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
  formatters: { level: (label) => ({ level: label.toUpperCase() }) },
  messageKey: "message",
};

const rootLogger = pino(sharedPinoConfig);

const toPinoLike = (logger: pino.Logger): pino.Logger & { log: pino.LogFn } =>
  Object.assign(logger, { log: logger.info.bind(logger) });

export const getLogger = (context?: string) =>
  toPinoLike(context ? rootLogger.child({ context }) : rootLogger);

export const getLoggerModule = () => {
  const loggerModule = LoggerModule.forRoot({
    pinoHttp: sharedPinoConfig,
  });
  return { ...loggerModule, global: true };
};
