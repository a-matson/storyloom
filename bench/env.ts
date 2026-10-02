import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';

/** Where every measurement lands; DECISIONS evidence and `[measured: <file>]` tags point here. */
export const OUT_DIR = 'docs/measurements';

export function envInfo() {
  return { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, date: new Date().toISOString() };
}

/** Writes `<OUT_DIR>/<date>-<name>.json` and returns its path. */
export function writeMeasurement(name: string, data: Record<string, unknown>): string {
  const env = envInfo();
  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${env.date.slice(0, 10)}-${name}.json`;
  writeFileSync(path, JSON.stringify({ env, ...data }, null, 2));
  return path;
}
