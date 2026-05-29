/**
 * Minimal .env loader. Imported FIRST in main.ts so environment variables are
 * available before any module (JWT secret, DB url) is evaluated. Looks in the
 * current working dir and the monorepo root. Existing env vars win.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const path of candidates) {
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([\w.]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
