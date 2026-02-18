// Graceful Shutdown Manager Tests

// Prevent actual process.exit during tests
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

// Fresh import for each test — module state must reset
let onShutdown: typeof import('./shutdown').onShutdown;
let gracefulShutdown: typeof import('./shutdown').gracefulShutdown;
let installShutdownHandlers: typeof import('./shutdown').installShutdownHandlers;

beforeEach(() => {
  jest.resetModules();
  mockExit.mockClear();

  // Re-import to reset module-level state (cleanupFns, shutdownInProgress)
  const mod = require('./shutdown');
  onShutdown = mod.onShutdown;
  gracefulShutdown = mod.gracefulShutdown;
  installShutdownHandlers = mod.installShutdownHandlers;
});

describe('onShutdown / gracefulShutdown', () => {
  it('should execute registered cleanup functions on shutdown', async () => {
    const order: string[] = [];
    onShutdown('first', () => { order.push('first'); });
    onShutdown('second', () => { order.push('second'); });

    await gracefulShutdown('SIGTERM');

    // LIFO order: second registered runs first
    expect(order).toEqual(['second', 'first']);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should handle async cleanup functions', async () => {
    let cleaned = false;
    onShutdown('async-cleanup', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      cleaned = true;
    });

    await gracefulShutdown('SIGINT');

    expect(cleaned).toBe(true);
  });

  it('should only run once even if called multiple times', async () => {
    let callCount = 0;
    onShutdown('counter', () => { callCount++; });

    await gracefulShutdown('SIGTERM');
    await gracefulShutdown('SIGTERM');

    expect(callCount).toBe(1);
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it('should continue cleanup even if one function throws', async () => {
    const order: string[] = [];
    onShutdown('first', () => { order.push('first'); });
    onShutdown('broken', () => { throw new Error('cleanup failed'); });
    onShutdown('third', () => { order.push('third'); });

    await gracefulShutdown('SIGTERM');

    // LIFO: third → broken (throws) → first
    expect(order).toEqual(['third', 'first']);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should work with no registered handlers', async () => {
    await gracefulShutdown('SIGTERM');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});

describe('installShutdownHandlers', () => {
  it('should register SIGTERM and SIGINT handlers', () => {
    const onSpy = jest.spyOn(process, 'on');

    installShutdownHandlers();

    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    onSpy.mockRestore();
  });

  it('should register unhandledRejection and uncaughtException handlers', () => {
    const onSpy = jest.spyOn(process, 'on');

    installShutdownHandlers();

    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

    onSpy.mockRestore();
  });
});

describe('exit codes', () => {
  it('should exit with code 1 for unhandledRejection', async () => {
    await gracefulShutdown('unhandledRejection');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit with code 1 for uncaughtException', async () => {
    await gracefulShutdown('uncaughtException');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit with code 0 for SIGTERM', async () => {
    await gracefulShutdown('SIGTERM');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should exit with code 0 for SIGINT', async () => {
    await gracefulShutdown('SIGINT');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
