import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// `vitest/config` re-exports Vite's `defineConfig` with the `test` block typed,
// so one config file drives both the dev server and the test runner.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Bind to loopback only. A dev server exposed on the LAN would be serving
    // an interface that handles sensitive documents.
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    name: 'web',
    // The only frontend tests today cover pure logic (the workflow reducer),
    // which needs no DOM. Rendering tests will need `environment: 'jsdom'` plus
    // the `jsdom` and `@testing-library/react` dev dependencies — deliberately
    // not installed until there is a component test that uses them. See
    // docs/DEVELOPMENT.md, "Adding component tests".
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
