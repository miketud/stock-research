// The one route the app ships on its own, and the one e2e smoke-tests.
//
// Files directly in routes/ mount at the root. A route that wants a prefix
// exports one:  export const autoPrefix = '/api/agent';

import type { FastifyPluginAsync } from 'fastify';

const route: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok' }));
};

export default route;
