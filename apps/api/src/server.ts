import { createApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Process entry point: configuration, listen, and orderly shutdown.
 *
 * Shutdown matters more than usual here. `app.close()` runs the `onClose` hook,
 * which clears the session store, so a redeploy or a SIGTERM does not leave
 * uploaded documents sitting in a process that is on its way out.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(
        () => {
          process.exit(0);
        },
        () => {
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: config.env.API_HOST, port: config.env.API_PORT });
}

main().catch((error: unknown) => {
  // The only place a bare console call is appropriate: the logger may not exist
  // yet if configuration itself failed.

  console.error('Failed to start the API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
