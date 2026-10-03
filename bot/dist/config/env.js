"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
const requiredVars = ['RPC_URL_WS', 'RPC_URL_HTTP', 'PRIVATE_KEY'];
for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}
exports.env = {
    RPC_URL_WS: process.env.RPC_URL_WS,
    RPC_URL_HTTP: process.env.RPC_URL_HTTP,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    BACKUP_RPC_URL: process.env.BACKUP_RPC_URL || '',
};
