import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vercel serves `public/` as static assets when no `outputDirectory` is set.
 * Keeping the Vite build in `apps/web/dist` and copying here means `/api`
 * serverless functions are still built (outputDirectory mode skips them).
 */
const root = process.cwd();
const from = join(root, 'apps', 'web', 'dist');
const to = join(root, 'public');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });

console.log(`Prepared Vercel static output: ${from} → ${to}`);
