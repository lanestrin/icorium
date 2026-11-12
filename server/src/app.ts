import Fastify, { type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { fileRoutes } from './routes/files';
import { createStorage, reconcileMetadata, seedSamples, type Storage } from './lib/storage';

/** Largest CSV upload, in megabytes, unless MAX_UPLOAD_MB says otherwise. */
export const DEFAULT_MAX_UPLOAD_MB = 10;
/** Log warnings and errors only, unless LOG_LEVEL says otherwise. */
export const DEFAULT_LOG_LEVEL = 'warn';
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export interface ServerSettings {
  maxUploadMb: number;
  logLevel: (typeof LOG_LEVELS)[number];
  host: string;
  port: number;
}

/**
 * The server's settings from environment variables, each falling back to today's default when unset
 * or empty. An invalid value stops startup with a message naming the variable. See "Settings" in the README.
 */
export function serverSettings(env: NodeJS.ProcessEnv = process.env): ServerSettings {
  const value = (name: string) => (env[name] === '' ? undefined : env[name]);
  const upload = value('MAX_UPLOAD_MB');
  const maxUploadMb = upload === undefined ? DEFAULT_MAX_UPLOAD_MB : Number(upload);
  if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0)
    throw new Error(`MAX_UPLOAD_MB must be a positive number of megabytes, got "${upload}".`);
  const logLevel = value('LOG_LEVEL') ?? DEFAULT_LOG_LEVEL;
  if (!(LOG_LEVELS as readonly string[]).includes(logLevel))
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}".`);
  return {
    maxUploadMb,
    logLevel: logLevel as ServerSettings['logLevel'],
    host: value('HOST') ?? '0.0.0.0',
    port: Number(value('PORT') ?? 3001),
  };
}

/**
 * Builds the API without starting it, so tests can call it with app.inject(). Uses the given storage,
 * or opens the one the environment names (see createStorage), and the given settings, or those from
 * the environment. Tests pass logger false to keep output quiet.
 */
export async function buildApp(logger?: FastifyServerOptions['logger'], store?: Storage, settings: ServerSettings = serverSettings()) {
  const storage = store ?? await createStorage();
  const app = Fastify({ logger: logger ?? { level: settings.logLevel } });
  await app.register(multipart, { limits: { fileSize: settings.maxUploadMb * 1024 * 1024 } });

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
