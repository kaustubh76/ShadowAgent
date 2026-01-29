// Mock for @provablehq/sdk for testing
/* eslint-disable @typescript-eslint/no-unused-vars */

export const initThreadPool = jest.fn().mockResolvedValue(undefined);

export class PrivateKey {
  static from_string(_str: string) {
    return new PrivateKey();
  }
  to_string() {
    return 'APrivateKey1mock...';
  }
}

export class Account {
  constructor(_options: { privateKey?: PrivateKey } = {}) {
    // Mock account
  }

  address() {
    return {
      to_string: () => 'aleo1mockaddress...',
    };
  }

  sign(_data: Uint8Array) {
    return {
      to_string: () => 'sign1mockSignature...',
    };
  }
}

export class ProgramManager {
  constructor(_rpcUrl?: string, _keyProvider?: unknown, _recordProvider?: unknown) {}

  async execute(..._args: unknown[]) {
    return 'mock-transaction-id';
  }
}

export class RecordPlaintext {
  static fromString(_ciphertext: string) {
    return new RecordPlaintext();
  }
}

export class Signature {
  static from_string(_str: string) {
    return new Signature();
  }

  verify(_address: unknown, _data: Uint8Array) {
    return true;
  }
}

export class Address {
  static from_string(_str: string) {
    return new Address();
  }
}
