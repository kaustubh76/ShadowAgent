// Graceful Shutdown Manager
// Coordinates cleanup of intervals, connections, and stores on process exit.

type CleanupFn = () => void | Promise<void>;

const cleanupFns: Array<{ name: string; fn: CleanupFn }> = [];
let shutdownInProgress = false;

/**
 * Register a cleanup function to run on shutdown.
 * Functions are executed in reverse order (LIFO) so dependencies shut down first.
 */
export function onShutdown(name: string, fn: CleanupFn): void {
  cleanupFns.push({ name, fn });
}

/**
 * Execute all registered cleanup functions and exit.
 * Safe to call multiple times — only runs once.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  // Optional logger — avoid circular dependency
  let log: ((msg: string) => void) | null = null;
  try {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const index = require('../index');
      log = (msg: string) => index.logger?.info(msg);
    }
  } catch {
    // Logger not available
  }

  log?.(`Received ${signal}, starting graceful shutdown...`);

  // Execute cleanup in reverse order (LIFO)
  for (let i = cleanupFns.length - 1; i >= 0; i--) {
    const { name, fn } = cleanupFns[i];
    try {
      await fn();
      log?.(`  ✓ ${name}`);
    } catch (err) {
      log?.(`  ✗ ${name}: ${err}`);
    }
  }

  const exitCode = (signal === 'unhandledRejection' || signal === 'uncaughtException') ? 1 : 0;
  log?.('Shutdown complete.');
  process.exit(exitCode);
}

/**
 * Install signal handlers for graceful shutdown.
 * Call this once at application startup.
 */
export function installShutdownHandlers(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
    console.error(`Unhandled rejection: ${msg}`);
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error: Error) => {
    console.error(`Uncaught exception: ${error.stack || error.message}`);
    gracefulShutdown('uncaughtException');
  });
}
