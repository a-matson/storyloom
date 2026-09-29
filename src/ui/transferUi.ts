import type { Adventure } from '@core/types';
import { exportAdventureJson, exportAdventureText, importAdventureJson, importAidZip } from '@storage/transfer';

/** Browser helpers for download / file-picker based import-export. */

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'adventure';
}

export function downloadAdventureJson(a: Adventure): void {
  downloadText(`${safeName(a.title)}.storyloom.json`, exportAdventureJson(a));
}

export function downloadAdventureText(a: Adventure): void {
  downloadText(`${safeName(a.title)}.txt`, exportAdventureText(a), 'text/plain');
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Import from a picked file: our JSON, an AID JSON, or an AID zip. */
export async function importAdventureFromFile(file: File, settings: Adventure['settings']): Promise<Adventure> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    return importAidZip(await file.arrayBuffer(), settings);
  }
  return importAdventureJson(await file.text(), settings);
}
