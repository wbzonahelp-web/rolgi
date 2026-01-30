/**
 * Централизованная система логирования для Rolgi
 * Использует Pino для быстрого структурированного логирования
 */

const pino = require('pino');

// Конфигурация логирования
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
};

// Добавляем pretty print для development
if (process.env.NODE_ENV !== 'production') {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

// Создаем и экспортируем logger
const logger = pino(loggerConfig);

module.exports = logger;
