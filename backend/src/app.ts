// ─────────────────────────────────────────────────────────────────────────────
// class:base — FROZEN. Do not add imports or route registrations here.
//
// This file registers nothing by name. Adding a route means dropping a file in
// src/routes/; adding CORS, auth or rate limiting means dropping a file in
// src/plugins/. That replaces the pattern of patching this file with
// `sed -i "${LAST_IMPORT}a import { agentRoutes } …"`, which silently wins or
// silently duplicates depending on what ran before it.
//
// import.meta.dirname is what makes the same file work in both directions:
// under `tsx watch` it resolves to src/, and after `tsc` it resolves to dist/,
// so autoload discovers the COMPILED routes from built output too.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';

import autoload from '@fastify/autoload';
import Fastify from 'fastify';

import { env } from './env.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
});

// Plugins first, and NOT encapsulated — a plugin here (cors, auth) is meant to
// apply to the whole app, not to its own scope.
await app.register(autoload, {
  dir: path.join(import.meta.dirname, 'plugins'),
  encapsulate: false,
  ignorePattern: /\.(test|spec|d)\.(ts|js)$/,
  options: { env },
});

// Routes second, so every route sees the plugins above.
// A route file is `<name>.route.ts`; `export const autoPrefix = '/api/x'` sets
// its mount point.
await app.register(autoload, {
  dir: path.join(import.meta.dirname, 'routes'),
  matchFilter: /\.route\.(ts|js)$/,
  ignorePattern: /\.(test|spec|d)\.(ts|js)$/,
  options: { env },
});

export default app;
