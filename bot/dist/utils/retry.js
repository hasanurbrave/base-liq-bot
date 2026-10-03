"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = void 0;
const logger_1 = require("./logger");
const withRetry = async (fn, component, operation, maxRetries = 5) => {
    let attempt = 0;
    let delay = 1000;
    while (attempt < maxRetries) {
        try {
            return await fn();
        }
        catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                logger_1.logger.error(component, `Operation ${operation} failed after ${maxRetries} attempts`, { error: error.message });
                throw error;
            }
            logger_1.logger.warn(component, `Operation ${operation} failed, retrying in ${delay}ms`, { attempt, error: error.message });
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 30000);
        }
    }
    throw new Error("Unreachable");
};
exports.withRetry = withRetry;
