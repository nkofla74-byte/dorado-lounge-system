import { log as axiomLog } from 'next-axiom';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

function createLogger(module: string) {
  function write(level: LogLevel, message: string, fields?: LogFields) {
    const enriched = { module, ...fields };
    axiomLog[level](message, enriched);
    if (process.env.NODE_ENV !== 'production') {
      console[level === 'debug' ? 'log' : level](`[${module}] ${message}`, enriched);
    }
  }

  return {
    debug: (msg: string, fields?: LogFields) => write('debug', msg, fields),
    info: (msg: string, fields?: LogFields) => write('info', msg, fields),
    warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
    error: (msg: string, fields?: LogFields) => write('error', msg, fields),
  };
}

export const logger = createLogger('app');
export { createLogger };
