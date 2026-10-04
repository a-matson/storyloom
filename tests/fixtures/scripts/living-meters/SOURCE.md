# Living Meters

Vendored verbatim as a parity fixture. Not shipped: test code only.

Picked as the second script because it uses a different API slice from
Auto-Cards: `state.memory.frontMemory`, `state.message`, `history`, the
context hook's `stop`, and slash commands in the input hook.

- Source: https://github.com/Oratorian/living-meters (`{library,input,context,output}.js`)
- Commit: `c4ebf5dd13a36b1b8de33ae08c39cf84b52f36ca`
- Author: Oratorian
- Licence: MIT (`https://github.com/Oratorian/living-meters/blob/main/LICENSE`), Copyright (c) 2026 Oratorian

Do not edit these files. A gap the parity run finds is fixed in
`src/adapters/scripting/prelude.ts`, never here.
