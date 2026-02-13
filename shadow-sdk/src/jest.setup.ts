// Jest setup: polyfill globalThis.crypto for Node test environment

import { createHash, randomBytes, randomUUID } from 'crypto';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      const bytes = randomBytes(arr.length);
      arr.set(bytes);
      return arr;
    },
    subtle: {
      digest: async (_algo: string, data: ArrayBuffer) => {
        return createHash('sha256').update(Buffer.from(data)).digest();
      },
    },
    randomUUID: () => randomUUID(),
  },
  writable: true,
});
