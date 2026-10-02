/**
 * Minimal ZIP reader — dependency-free, browser + Node 18+.
 * Supports the two compression methods real-world zips use: 0 (stored) and
 * 8 (deflate, via DecompressionStream('deflate-raw')). Reads the central
 * directory, so it copes with data descriptors and zip64-less archives up
 * to 4 GB. Enough for AI Dungeon's "Download Adventure" export and our own.
 */
export interface ZipEntry {
  name: string;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
  isDirectory: boolean;
}

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export class ZipReader {
  private view: DataView;
  private bytes: Uint8Array;
  readonly entries: ZipEntry[];

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    this.entries = this.readCentralDirectory();
  }

  private readCentralDirectory(): ZipEntry[] {
    const v = this.view;
    let eocd = -1;
    for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 22 - 65535); i--) {
      if (v.getUint32(i, true) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record)');
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const out: ZipEntry[] = [];
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== SIG_CEN) throw new Error('Corrupt zip central directory');
      const method = v.getUint16(p + 10, true);
      const compressedSize = v.getUint32(p + 20, true);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const offset = v.getUint32(p + 42, true);
      const name = dec.decode(this.bytes.subarray(p + 46, p + 46 + nameLen));
      out.push({ name, size, compressedSize, method, offset, isDirectory: name.endsWith('/') });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  find(pred: string | RegExp | ((e: ZipEntry) => boolean)): ZipEntry | undefined {
    const fn = typeof pred === 'string' ? (e: ZipEntry) => e.name === pred : pred instanceof RegExp ? (e: ZipEntry) => pred.test(e.name) : pred;
    return this.entries.find(fn);
  }

  async read(entry: ZipEntry): Promise<Uint8Array> {
    const v = this.view;
    const p = entry.offset;
    if (v.getUint32(p, true) !== SIG_LOC) throw new Error(`Corrupt local header for ${entry.name}`);
    const nameLen = v.getUint16(p + 26, true);
    const extraLen = v.getUint16(p + 28, true);
    const start = p + 30 + nameLen + extraLen;
    const data = this.bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`Unsupported zip compression method ${entry.method} for ${entry.name}`);
  }

  async readText(entry: ZipEntry): Promise<string> {
    return new TextDecoder().decode(await this.read(entry));
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is not available in this environment');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
