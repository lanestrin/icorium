import Fastify, { type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { fileRoutes } from './routes/files';
import { createStorage, reconcileMetadata, seedSamples, type Storage } from './lib/storage';

/**
 * Builds the API without starting it, so tests can call it with app.inject(). Uses the given storage,
 * or opens the one the environment names (see createStorage).
 */
export async function buildApp(logger: FastifyServerOptions['logger'] = { level: 'warn' }, store?: Storage) {
  const storage = store ?? await createStorage();
  const app = Fastify({ logger });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ message: err.issues.map((i) => i.message).join('; ') });
    const code = err.statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ message: err.message });
  });

  await seedSamples(storage);
  // Older metadata is corrected once here, so GET /api/files is a pure read.
  const { skipped } = await reconcileMetadata(storage);
  if (skipped.length) app.log.warn(`Could not read ${skipped.length} stored file(s) to update their metadata: ${skipped.join(', ')}`);
  await app.register(fileRoutes, { prefix: '/api', storage });
  return app;
}
