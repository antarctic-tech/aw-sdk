import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SDK_VERSION } from '../../src/utils/version';

describe('SDK_VERSION', () => {
  it('совпадает с версией из package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
    ) as { version: string };

    expect(SDK_VERSION).toBe(pkg.version);
  });
});
