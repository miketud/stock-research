// class:base — CORS is a base concern, not an injection's.
//
// Under the singleton rule, anything that must live in backend/src/app.ts
// belongs to the base. The agent injection needed CORS and so patched app.ts by
// hand; here it is simply a plugin the base ships, and any injection that needs
// an extra origin adds one to CORS_ORIGIN in .env rather than editing code.

import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';

import { corsOrigins } from '../env.js';

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
};

export default plugin;
