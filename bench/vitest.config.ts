import { defineConfig } from 'vitest/config';
import base from '../vite.config';

// Benchmarks run as one long test file each; never part of `pnpm test`. Spread, not mergeConfig: that would append to `include`.
export default defineConfig({ ...base, test: { ...base.test, include: ['bench/**/*.bench.ts'], testTimeout: 600_000 } });
