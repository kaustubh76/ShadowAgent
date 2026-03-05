// Polyfill globalThis.crypto for Node.js < 20 test environments
// Node 20+ has globalThis.crypto, but some environments may not

import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}
