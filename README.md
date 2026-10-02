# Storyloom

A single-user, local-first AI text adventure engine in the style of AI Dungeon. The browser runs the whole game — story cards, memory system, scripting, context assembly — and a local inference server (llama-server, KoboldCpp, Ollama, LM Studio…) generates the text. No accounts, no cloud, no paid services.

```
pnpm install
pnpm dev           # http://localhost:5173
pnpm check         # typecheck + tests
```

You need a story model running locally, e.g.

```
llama-server -m Wayfarer-2-12B-Q4_K_M.gguf -c 8192 -ngl 99 -fa on --port 8080 -np 2
```

See `docs/MODELS.md` for which model fits your GPU, `docs/PLAN.md` for the plan, `docs/MILESTONES.md` for what's next, and `AGENTS.md` if you are an agent (or a human) picking this up.

## Status

Milestone 1 (core loop) is scaffolded: the context builder, action log, memory scheduling, story-card triggers, templates and placeholders are implemented and unit-tested; the UI has a Library, a Game screen with sidebar and context viewer, and a Setup screen. It has not yet been played against a live model — that is the first item in `docs/MILESTONES.md`.

## Licence

MIT for this code. Models carry their own licences (Llama community licence, Gemma terms, Apache-2.0 for Mistral bases); check each Hugging Face card.
