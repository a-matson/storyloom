import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { ScriptRequest, type ScriptReply } from './protocol';
import { compileScripts, runInSandbox, type Scripts } from './sandbox';

// The wasm is bundled with the app; nothing is fetched from a CDN at runtime.
let module: Promise<QuickJSWASMModule> | undefined;
const load = () => (module ??= newQuickJSWASMModuleFromVariant(variant));

let scripts: Scripts = { library: '', input: '', context: '', output: '' };
const post = (reply: ScriptReply) => postMessage(reply, {});

async function handle(data: unknown): Promise<void> {
  const req = ScriptRequest.safeParse(data);
  if (!req.success) return post({ type: 'error', message: `bad request: ${req.error.message}` });
  const msg = req.data;
  try {
    const wasm = await load();
    if (msg.type === 'load') {
      const compiled = compileScripts(wasm, msg.scripts);
      scripts = msg.scripts;
      return post({ type: 'loaded', ...compiled });
    }
    post({ type: 'result', id: msg.id, result: runInSandbox(wasm, scripts, msg.input) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    post(msg.type === 'run' ? { type: 'error', id: msg.id, message } : { type: 'loaded', ok: false, error: message });
  }
}

addEventListener('message', (e: MessageEvent) => void handle(e.data));
