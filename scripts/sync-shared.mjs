import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const target of ['backend/src/shared', 'frontend/src/shared']) {
  const dest = resolve(root, target);
  mkdirSync(dest, { recursive: true });
  cpSync(resolve(root, 'shared'), dest, { recursive: true });
  console.log('synced shared ->', target);
}
