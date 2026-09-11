// class:base — fail-fast environment validation.
//
// Parsed once, at import time, so a missing or malformed variable is a startup
// error with a named field rather than `undefined` surfacing three layers deep.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Comma-separated. The frontend dev server is the default origin.
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(['', '  Invalid environment:', ...lines, '', '  See backend/.env.example.', ''].join('\n'));
  process.exit(1);
}

export const env: Env = parsed.data;

export const corsOrigins: string[] = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
