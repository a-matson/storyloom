# Storyloom

A single-user, local-first AI text adventure engine in the style of AI Dungeon. The browser runs the whole game — story cards, memory system, scripting, context assembly — and a local inference server (llama-server, KoboldCpp, Ollama, LM Studio…) generates the text. No accounts, no cloud, no paid services.

Requires Node ≥ 22 and pnpm.

```
pnpm install
pnpm dev           # http://localhost:5173
pnpm check         # typecheck + tests
pnpm build         # dist/
```

You need a story model running locally, e.g.

```
llama-server -m Wayfarer-2-12B-Q4_K_M.gguf -c 8192 -ngl 99 -fa on --port 8080 -np 2
```

No GPU? `pnpm fake-backend` starts a fake llama-server on :8080 that streams canned prose.

## Licence

MIT for this code. Models carry their own licences (Llama community licence, Gemma terms, Apache-2.0 for Mistral bases); check each Hugging Face card.
