// class:base — the one route the base ships, and the one conformance smoke-tests.
//
// Files directly in routes/ mount at the root. A route that wants a prefix
// exports one:  export const autoPrefix = '/api/agent';

import type { FastifyPluginAsync } from 'fastify';

const route: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));
};

export default route;
