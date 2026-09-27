export enum LogLevel { DEBUG = 'DEBUG', INFO = 'INFO', WARN = 'WARN', ERROR = 'ERROR' }
export const logger = {
  log: (level: LogLevel, component: string, message: string, data?: any) => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, component, message, data }));
  },
  debug: (component: string, message: string, data?: any) => logger.log(LogLevel.DEBUG, component, message, data),
  info: (component: string, message: string, data?: any) => logger.log(LogLevel.INFO, component, message, data),
  warn: (component: string, message: string, data?: any) => logger.log(LogLevel.WARN, component, message, data),
  error: (component: string, message: string, data?: any) => logger.log(LogLevel.ERROR, component, message, data)
};
