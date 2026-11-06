import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { fileRoutes } from './routes/files';
import { seedSamples } from './lib/storage';

const app = Fastify({ logger: { level: 'warn' } });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ message: err.issues.map((i) => i.message).join('; ') });
  const code = err.statusCode ?? 500;
  if (code >= 500) app.log.error(err);
  return reply.code(code).send({ message: err.message });
});

seedSamples();
await app.register(fileRoutes, { prefix: '/api' });
await app.listen({ port: 3001 });
console.log('API on http://localhost:3001');
