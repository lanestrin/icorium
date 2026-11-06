import { buildApp } from './app';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port });
console.log(`API on http://localhost:${port}`);
