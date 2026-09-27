import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
const requiredVars = ['RPC_URL_WS', 'RPC_URL_HTTP', 'PRIVATE_KEY'];
for (const envVar of requiredVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
export const env = {
  RPC_URL_WS: process.env.RPC_URL_WS!,
  RPC_URL_HTTP: process.env.RPC_URL_HTTP!,
  PRIVATE_KEY: process.env.PRIVATE_KEY!,
  BACKUP_RPC_URL: process.env.BACKUP_RPC_URL || '',
};
