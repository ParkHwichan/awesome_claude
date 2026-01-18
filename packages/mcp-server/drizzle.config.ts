import { defineConfig } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

const appData = process.env.APPDATA || process.env.LOCALAPPDATA || join(homedir(), '.local', 'share');
const dbPath = process.env.DB_PATH || join(appData, 'awesome-claude', 'data', 'awesome-claude.db');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
});
