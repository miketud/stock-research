// class:base — process entrypoint. app.ts stays transport-agnostic so it can be
// imported directly by tests without binding a port.

import { execFileSync } from 'node:child_process';

import app from './app.js';
import { env } from './env.js';

/**
 * Who is holding this port?
 *
 * `ss` is part of iproute2 and present on every modern Linux; `lsof` is the
 * fallback for macOS and older boxes. Both are best-effort — this runs only on
 * the failure path, so a missing tool costs a slightly less helpful message and
 * nothing else.
 */
function findPortHolder(port: number): string | null {
  const attempts: Array<[string, string[], RegExp]> = [
    // ss:   users:(("node",pid=1447295,fd=23))
    ['ss', ['-ltnpH', `sport = :${port}`], /pid=(\d+)/],
    // lsof: node    1447295 mike2   23u  IPv4 ...
    ['lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], /^(\d+)/m],
  ];

  for (const [cmd, args, extract] of attempts) {
    try {
      const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const pid = out.match(extract)?.[1];
      if (!pid) continue;

      // /proc is Linux-only; `ps` covers the rest. Again, best effort.
      let command = '';
      try {
        command = execFileSync('ps', ['-p', pid, '-o', 'args='], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        /* the pid alone is still useful */
      }
      return command ? `PID ${pid}\n           ${command}` : `PID ${pid}`;
    } catch {
      /* try the next tool */
    }
  }
  return null;
}

/**
 * The port never drifts.
 *
 * Scanning to the next free port is a reasonable convention for a dev server
 * nothing else calls — Next and Vite both do it. It is the wrong default for an
 * API, because the port is a contract: the frontend has an API URL pinned in
 * its own .env, and CORS is configured against a specific origin. If this
 * process quietly moved to 3002 while a stale `tsx watch` kept answering on
 * 3001, the frontend would connect happily to the OLD code and every symptom
 * would point somewhere other than the cause.
 *
 * So: refuse, and make the refusal actionable. This is Vite's `strictPort: true`.
 */
function reportPortInUse(port: number): void {
  const holder = findPortHolder(port);
  const kill = holder?.match(/PID (\d+)/)?.[1];

  const lines = [
    '',
    `  ✖ Port ${port} is already in use.`,
    '',
    holder ? `    Held by: ${holder}` : `    Could not identify the process holding it.`,
    '',
    '    Free it:',
    kill ? `        kill ${kill}` : `        fuser -k ${port}/tcp`,
    '',
    '    Or pin a different port:',
    `        echo "PORT=${port + 1}" >> backend/.env`,
    '',
    '    The port is deliberately not auto-incremented: the frontend and CORS',
    '    are configured against it, and a silent move would leave whatever is',
    '    already on this port answering their requests.',
    '',
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      reportPortInUse(env.PORT);
    } else {
      app.log.error(err);
    }
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, closing`);
    void app.close().then(() => process.exit(0));
  });
}

void start();
