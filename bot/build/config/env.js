"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
var requiredVars = ['RPC_URL_WS', 'RPC_URL_HTTP', 'PRIVATE_KEY'];
for (var _i = 0, requiredVars_1 = requiredVars; _i < requiredVars_1.length; _i++) {
    var envVar = requiredVars_1[_i];
    if (!process.env[envVar]) {
        console.error("Missing required environment variable: ".concat(envVar));
        process.exit(1);
    }
}
exports.env = {
    RPC_URL_WS: process.env.RPC_URL_WS,
    RPC_URL_HTTP: process.env.RPC_URL_HTTP,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    BACKUP_RPC_URL: process.env.BACKUP_RPC_URL || '',
};
