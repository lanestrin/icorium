import type { FastifyInstance } from 'fastify';
import { buildApp, serverSettings } from './app';

async function start() {
  let app: FastifyInstance | undefined;
  try {
    const settings = serverSettings();
    app = await buildApp(undefined, undefined, settings);
    await app.listen({ port: settings.port, host: settings.host });
    app.log.info(`API on http://localhost:${settings.port}`);
  } catch (error) {
    // Before the app exists (invalid settings, storage refused) there is no app logger yet.
    if (app) app.log.error(error);
    else console.error(error);
    process.exit(1);
  }
}

// Let the entrypoint finish evaluating while Vercel observes server startup.
void start();
