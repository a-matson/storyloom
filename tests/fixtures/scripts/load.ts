import { readFileSync } from 'node:fs';
import type { Scripts } from '@adapters/scripting';

/** Reads a vendored community script directory into the four hook sources. Tests only. */
export function loadScripts(dir: string): Scripts {
  const read = (name: keyof Scripts) => readFileSync(new URL(`./${dir}/${name}.js`, import.meta.url), 'utf8');
  return { library: read('library'), input: read('input'), context: read('context'), output: read('output') };
}
