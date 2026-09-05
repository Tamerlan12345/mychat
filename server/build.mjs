// Bundles the gateway into a single Node file. tsconfig paths ("@/…") are resolved by esbuild,
// and Next's `server-only` marker is aliased to an empty module so the shared lib/telegram code
// runs outside Next.js.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(root, 'dist-server/index.js'),
  tsconfig: resolve(root, 'tsconfig.json'),
  alias: { 'server-only': resolve(here, 'src/shims/server-only.ts') },
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});
