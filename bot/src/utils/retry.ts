import { logger } from './logger';
export const withRetry = async <T>(fn: () => Promise<T>, component: string, operation: string, maxRetries: number = 5): Promise<T> => {
  let attempt = 0; let delay = 1000;
  while (attempt < maxRetries) {
    try { return await fn(); }
    catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) { logger.error(component, `Operation ${operation} failed after ${maxRetries} attempts`, { error: error.message }); throw error; }
      logger.warn(component, `Operation ${operation} failed, retrying in ${delay}ms`, { attempt, error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
  throw new Error("Unreachable");
};
