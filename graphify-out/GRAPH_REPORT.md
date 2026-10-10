# Graph Report - storyloom (2026-10-10)

## Corpus Check

- 381 files · ~218,637 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .webmanifest 1, .css 1)

## Summary

- 2331 nodes · 7514 edges · 104 communities (94 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 114 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- Providers & Services Wiring
- Image Presets & Settings
- Memory Timing & Cover Picker
- App Shell & Library
- Action Blocks & Core UI
- Story Card Generator
- Drawer & Card Settings UI
- Memory Retrieval Fusion
- Script Hooks & Turn Outcomes
- Icons
- Embeddings Worker
- Entity Matching
- HTTP & Llama Server
- GameSession
- Auto-Cards Script
- Idle Work & Session Hosts
- Scenario Tree Model
- Dexie Storage
- Provider & Script Ports
- See Prompt Composition
- tsconfig
- Form Controls & Card Details
- Ports & Contradiction Tests
- oxlint Config
- Context Meter & Cards Tab
- History & Scene Rendering
- package.json
- DB Rows
- Story Card Matching
- Details Tab & Placeholders
- Core Benchmarks
- Gate & Template Benchmarks
- Recall Bench
- Recall Page Harness
- Canon & Scenario Seeding
- Image Queue & Progress
- devDependencies
- Import/Export Transfer
- Fake Llama Backend
- Auto-Cards Text Utilities
- Zod Adventure Schema
- A1111 Image Provider
- Quick Starts & Opening
- ActionLog
- Script Runner & State
- Idle Gen & Model Presets
- Session Snapshot & Fixtures
- Auto-Cards Construction
- npm Scripts
- Session Images
- Portraits
- Context Sections & Budget
- Runtime Dependencies
- Log & Adventure Fixtures
- Storage Port
- Entity Corrections
- Lexical Search & Content Clause
- QuickJS Scripting
- Memory Classification
- Idle Work Controller
- Extraction Schemas
- Script Worker
- QuickJS Runner
- Memory Scheduler
- Auto-Cards Memory Heuristics
- Introductions & Portrait Bench
- E2E Seeded Specs
- Script Protocol
- Scenario Grid
- Stryker Config
- E2E Install & Settings Specs
- Own-Format Transfer
- Structured Context Tests
- Context Card Types
- Trace & Job Log
- Formatting & Speakers
- Living-Meters Hooks
- AID Import
- Settings Model
- Script Sandbox Prelude
- Context Builder
- Action & Trace Schema
- faceFor
- Auto-Cards Turn Handling
- E2E Library & Scenario Specs
- Bootstrap & Fonts
- Auto-Cards Memory Construct
- Auto-Cards Generation Flow
- Image Utilities
- Scene Tracking
- Auto-Cards Memory Isolation
- oxfmt Config
- Context Builder Tests
- Auto-Cards Card Config
- Context Viewer Spec
- Scenario Options
- Embeddings Spec
- knip Config
- Measure Script
- Vite Config
- Speech Spec
- Prettier Config
- Living-Meters Library

## God Nodes (most connected - your core abstractions)

1. `AutoCards()` - 126 edges
2. `Adventure` - 84 edges
3. `Button()` - 77 edges
4. `vitest` - 67 edges
5. `GameSession` - 66 edges
6. `react` - 65 edges
7. `AppSettings` - 65 edges
8. `Action` - 64 edges
9. `cn()` - 60 edges
10. `Provider` - 43 edges

## Surprising Connections (you probably didn't know these)

- `TurnInput()` --indirect_call--> `send()` [INFERRED]
  src/ui/features/game/TurnInput.tsx → bench/recallPage.ts
- `AutoCards()` --indirect_call--> `text()` [INFERRED]
  tests/fixtures/scripts/auto-cards/library.js → src/ui/features/game/sidebar/ImagesSection.tsx
- `record()` --calls--> `writeMeasurement()` [EXTRACTED]
  e2e/live/recall.spec.ts → bench/env.ts
- `adventure()` --calls--> `makeAdventure()` [EXTRACTED]
  bench/gatev.bench.ts → tests/fixtures/adventure.ts
- `deps()` --calls--> `createApproxTokenizer()` [EXTRACTED]
  bench/gatev.bench.ts → src/core/text/tokenizer.ts

## Import Cycles

- None detected.

## Communities (104 total, 10 thin omitted)

### Community 0 - "Providers & Services Wiring"

Cohesion: 0.06
Nodes (53): loadInBrowserEmbedder(), createProvider(), DEFAULT_PROVIDER_CONFIG, demoFetch(), loadImageProvider(), DEFAULT_APP_SETTINGS, embedderFor(), embedders (+45 more)

### Community 1 - "Image Presets & Settings"

Cohesion: 0.06
Nodes (42): applyImagePreset(), IMAGE_PRESETS, ImageSettings, presetFrom(), savePreset(), ImagePreset, Appearance(), Feedback() (+34 more)

### Community 2 - "Memory Timing & Cover Picker"

Cohesion: 0.09
Nodes (41): class-variance-authority, getImageProgress(), subscribeImageProgress(), actionsUntilSummary(), SUMMARY_INTERVAL, CoverPicker(), message(), Input() (+33 more)

### Community 3 - "App Shell & Library"

Cohesion: 0.07
Nodes (42): AdventureSummary, App(), GameScreen, ScenarioEditor, SetupScreen, CoverThumb(), Props, Toast() (+34 more)

### Community 4 - "Action Blocks & Core UI"

Cohesion: 0.10
Nodes (41): Entity, paragraphs(), buttonClass(), ButtonProps, buttonVariants, Props, ActionBlock(), Props (+33 more)

### Community 5 - "Story Card Generator"

Cohesion: 0.09
Nodes (39): jsonrepair, acceptCard(), DEFAULT_GENERATOR_SETTINGS, GenerateCardRequest, GeneratedCard, generateStoryCard(), parseCardJson(), recentStory() (+31 more)

### Community 6 - "Drawer & Card Settings UI"

Cohesion: 0.10
Nodes (33): react, memoryEdits(), CardGeneratorSettings, Drawer(), DrawerBody(), DrawerHeader(), Props, Segmented() (+25 more)

### Community 7 - "Memory Retrieval Fusion"

Cohesion: 0.09
Nodes (41): catchUpEntities(), mmr(), MMR_LAMBDA, rrf(), RRF_K, actionsUntilMemory(), cosine(), createMemory() (+33 more)

### Community 8 - "Script Hooks & Turn Outcomes"

Cohesion: 0.12
Nodes (37): ScriptCache, TurnErrorKind, TurnKind, TurnOutcome, CompletionStats, HookName, ScriptEntity, ScriptHistoryEntry (+29 more)

### Community 9 - "Icons"

Cohesion: 0.10
Nodes (34): base(), IconBack(), IconBook(), IconChevron(), IconClose(), IconHome(), IconLeft(), IconRedo() (+26 more)

### Community 10 - "Embeddings Worker"

Cohesion: 0.08
Nodes (17): @huggingface/transformers, handle(), load(), post(), fnv1a(), HashEmbedder, ProviderEmbedder, STOP (+9 more)

### Community 11 - "Entity Matching"

Cohesion: 0.11
Nodes (34): checkInputs(), attributeSpeakers(), entityNamedIn(), guessUnlabelled(), isOutput(), matchEntity(), mergeEntities(), namedInPassage() (+26 more)

### Community 12 - "HTTP & Llama Server"

Cohesion: 0.10
Nodes (22): eventsource-parser, ensureOk(), ProviderError, Schema, sseEvents(), validate(), statsOf(), STOP_TYPES (+14 more)

### Community 13 - "GameSession"

Cohesion: 0.12
Nodes (3): GameSession, GameSnapshot, markStale()

### Community 14 - "Auto-Cards Script"

Cohesion: 0.06
Nodes (13): AutoCards(), assignBannedTitles(), deepMerge(), getDefaultConfigBans(), isMinorWord(), permitOutput(), pinAndSortCards(), postOutputMessage() (+5 more)

### Community 15 - "Idle Work & Session Hosts"

Cohesion: 0.13
Nodes (18): IdleCallbacks, IdleHost, SeeHost, Host, PortraitHost, sessionScripts(), message(), HelperModel (+10 more)

### Community 16 - "Scenario Tree Model"

Cohesion: 0.10
Nodes (25): dexie-react-hooks, tokenizer, childAt(), coverIds(), creatorChoices(), withChild(), appendLog(), ConsoleLog() (+17 more)

### Community 17 - "Dexie Storage"

Cohesion: 0.10
Nodes (10): DexieStorage, parseOrThrow(), clearPending(), markPending(), store(), takePending(), withoutEmbeddings(), Deps (+2 more)

### Community 18 - "Provider & Script Ports"

Cohesion: 0.10
Nodes (14): Provider, NoopScriptRunner, createApproxTokenizer(), TurnEvent, playTurns(), recording(), built, tokenizer (+6 more)

### Community 19 - "See Prompt Composition"

Cohesion: 0.13
Nodes (31): AutoRequest, IMAGE_PROMPT_CHARS, IMAGE_PROMPT_SYSTEM, ImagePromptInput, seePrompt(), SeeRequest, CAST_CAP, castIn() (+23 more)

### Community 20 - "tsconfig"

Cohesion: 0.06
Nodes (32): compilerOptions, allowImportingTsExtensions, allowUnreachableCode, allowUnusedLabels, erasableSyntaxOnly, esModuleInterop, exactOptionalPropertyTypes, jsx (+24 more)

### Community 21 - "Form Controls & Card Details"

Cohesion: 0.14
Nodes (25): Select(), Props, Switch(), Textarea(), CardDetails(), Field(), GenerateButton(), Flag (+17 more)

### Community 22 - "Ports & Contradiction Tests"

Cohesion: 0.18
Nodes (16): turns, vitest, mergeEntity(), CompletionRequest, adventure(), ENTITY_PROMPT, fakeDeps(), fakeProvider() (+8 more)

### Community 23 - "oxlint Config"

Cohesion: 0.07
Nodes (28): categories, correctness, perf, suspicious, ignorePatterns, overrides, plugins, rules (+20 more)

### Community 24 - "Context Meter & Cards Tab"

Cohesion: 0.12
Nodes (18): tone(), ContextMeter(), GameScreen(), CardRow(), CardsTab(), CHIP, Props, SECTION_BODY (+10 more)

### Community 25 - "History & Scene Rendering"

Cohesion: 0.15
Nodes (20): chunkedStart(), HistoryResult, historyWindowStart(), selectHistory(), selectMemories(), cap(), HEADERS, renderScene() (+12 more)

### Community 26 - "package.json"

Cohesion: 0.07
Nodes (26): description, engines, node, name, packageManager, private, type, version (+18 more)

### Community 27 - "DB Rows"

Cohesion: 0.18
Nodes (17): StoryloomDb, ActionRow, AdventureRow, CardRow, EntityRow, ImageRow, joinAdventure(), MemoryRow (+9 more)

### Community 28 - "Story Card Matching"

Cohesion: 0.15
Nodes (17): compileCards(), findTriggeredCards(), GENERIC_TRIGGERS, lookbackWindow(), matchCards(), MAX_STORY_CARDS, parseTriggers(), selectCards() (+9 more)

### Community 29 - "Details Tab & Placeholders"

Cohesion: 0.22
Nodes (22): DetailsTab(), fail(), Field(), Group(), message(), cardContext(), importCards(), message() (+14 more)

### Community 30 - "Core Benchmarks"

Cohesion: 0.11
Nodes (11): Cases, settings, tokenizer, envInfo(), writeMeasurement(), complete(), SCENE, TAMSIN (+3 more)

### Community 31 - "Gate & Template Benchmarks"

Cohesion: 0.18
Nodes (14): adventure(), Applied, deps(), post(), Props, run(), series(), templateCase() (+6 more)

### Community 32 - "Recall Bench"

Cohesion: 0.13
Nodes (20): FactClass, FACTS, FILLERS, hit(), isOrig(), OPENING, ORIG, PlantMode (+12 more)

### Community 33 - "Recall Page Harness"

Cohesion: 0.15
Nodes (20): scenarioJson(), costAndState(), idle(), lastTurn(), readAdventure(), rewind(), Rows, run (+12 more)

### Community 34 - "Canon & Scenario Seeding"

Cohesion: 0.15
Nodes (15): tokenizerFor(), KINDS, seedCanonEntities(), createAdventureFromScenario(), DEFAULT_AI_INSTRUCTIONS, missingAnswers(), placeholderQuestions(), scenarioSummary() (+7 more)

### Community 35 - "Image Queue & Progress"

Cohesion: 0.12
Nodes (10): ImageProgressView, listeners, POLL_MS, publish(), withProgress(), ImageJobKind, imageQueue, Job (+2 more)

### Community 36 - "devDependencies"

Cohesion: 0.08
Nodes (24): devDependencies, @axe-core/playwright, fake-indexeddb, knip, lefthook, oxc-transform-react, oxfmt, oxlint (+16 more)

### Community 37 - "Import/Export Transfer"

Cohesion: 0.20
Nodes (15): fflate, exportStoryCardsJson(), importStoryCardsJson(), importAdventureJson(), exportAdventureJson(), exportAdventureText(), exportTracesJsonl(), exportScenarioJson() (+7 more)

### Community 38 - "Fake Llama Backend"

Cohesion: 0.12
Nodes (21): srvx, handler, port, card(), CompletionBody, CORS, createFakeLlama(), evt() (+13 more)

### Community 39 - "Auto-Cards Text Utilities"

Cohesion: 0.10
Nodes (16): checkPlurals(), check(), formatTitle(), getDataVariants(), hoistInternal(), bad(), checkRemaining(), isolateProperty() (+8 more)

### Community 40 - "Zod Adventure Schema"

Cohesion: 0.14
Nodes (17): zod, CARD_JSON_SCHEMA, { $schema: _dialect, ...schema }, Adventure, CardGeneratorSettings, DayPart, Placeholder, PlotComponents (+9 more)

### Community 41 - "A1111 Image Provider"

Cohesion: 0.15
Nodes (11): A1111Provider, base64(), noUpscale(), snap(), Upscale, A1111Models, A1111Progress, A1111Samplers (+3 more)

### Community 42 - "Quick Starts & Opening"

Cohesion: 0.11
Nodes (9): Started, surpriseAdventure(), openingRequest, QUICK_STARTS, Scenario, surprisePrompt(), Props, card() (+1 more)

### Community 44 - "Script Runner & State"

Cohesion: 0.14
Nodes (14): Waiter, parseScriptState(), Scripts, testScript(), ScriptState, HookInput, HookResult, toScriptCards() (+6 more)

### Community 45 - "Idle Gen & Model Presets"

Cohesion: 0.16
Nodes (16): runIdleWork(), GenerateDeps, ImagePromptDeps, ActionType, ModelSettings, TemplateId, MODEL_PRESETS, ModelPreset (+8 more)

### Community 46 - "Session Snapshot & Fixtures"

Cohesion: 0.16
Nodes (10): createBlankAdventure(), gate, withGate(), settled(), setup(), memory, withMemory(), withImages() (+2 more)

### Community 47 - "Auto-Cards Construction"

Cohesion: 0.12
Nodes (17): banTitle(), collectAll(), collectCards(), addAuxiliary(), constructPrimary(), setAuxiliary(), constructCard(), disableAutoCards() (+9 more)

### Community 48 - "npm Scripts"

Cohesion: 0.10
Nodes (21): scripts, bench, build, check, dev, e2e, e2e:update-screenshots, e2e:visual (+13 more)

### Community 49 - "Session Images"

Cohesion: 0.20
Nodes (16): Composed, drop(), dropOrphanImages(), editSeePrompt(), generate(), Image, imageFailure(), message() (+8 more)

### Community 50 - "Portraits"

Cohesion: 0.22
Nodes (14): GENRE_STYLE, PORTRAIT_NEGATIVE, portraitPrompt(), portraitStyle(), find(), PORTRAIT_PX, PORTRAIT_RETRY_TURNS, queuePortraits() (+6 more)

### Community 51 - "Context Sections & Budget"

Cohesion: 0.20
Nodes (14): AppliedSections, applyScriptSections(), isKind(), KINDS, ContextBuildResult, ContextSection, SectionKind, BudgetView() (+6 more)

### Community 52 - "Runtime Dependencies"

Cohesion: 0.11
Nodes (18): dependencies, class-variance-authority, clsx, dexie, dexie-react-hooks, eventsource-parser, fflate, @fontsource/ibm-plex-mono (+10 more)

### Community 53 - "Log & Adventure Fixtures"

Cohesion: 0.15
Nodes (9): dexie, fake-indexeddb, adventure(), FixtureOptions, makeAdventure(), NAMES, rng(), WORDS (+1 more)

### Community 55 - "Entity Corrections"

Cohesion: 0.26
Nodes (12): correct(), entityEdits(), message(), patch(), refreshEntity(), withoutLook(), clearPortrait(), dropPortrait() (+4 more)

### Community 56 - "Lexical Search & Content Clause"

Cohesion: 0.19
Nodes (12): storyModel(), bm25(), BM25_B, BM25_K1, Bm25Index, buildIndex(), tokenise(), contentClause() (+4 more)

### Community 57 - "QuickJS Scripting"

Cohesion: 0.26
Nodes (13): @jitl/quickjs-wasmfile-release-sync, quickjs-emscripten-core, SandboxInput, SandboxOutput, compileScripts(), Scripts, parityRun(), Play (+5 more)

### Community 58 - "Memory Classification"

Cohesion: 0.16
Nodes (13): Saved, MemoriesResult, Memory, byRelevance(), byTimeline(), classifyMemories(), countByStatus(), MemoryRow (+5 more)

### Community 59 - "Idle Work Controller"

Cohesion: 0.17
Nodes (3): IdleWork, PendingScripts, ScriptRunner

### Community 60 - "Extraction Schemas"

Cohesion: 0.15
Nodes (12): EXTRACT_JSON_SCHEMA, INTRODUCE_JSON_SCHEMA, count, Entity, EntityFact, EntityKind, Relation, ExtractedEntity (+4 more)

### Community 61 - "Script Worker"

Cohesion: 0.18
Nodes (7): ScriptRequest, ScriptWorker, FakeWorker, harness(), hookInput, SCRIPTS, sections

### Community 62 - "QuickJS Runner"

Cohesion: 0.26
Nodes (4): createQuickJsRunner(), failed(), QuickJsScriptRunner, plainSections()

### Community 64 - "Auto-Cards Memory Heuristics"

Cohesion: 0.17
Nodes (14): boundInteger(), estimateRemainingGens(), estimateResponseLength(), exceedsMemoryLimit(), getDefaultConfig(), promoteAmnesia(), setCandidateTurnBounds(), sortCandidates() (+6 more)

### Community 65 - "Introductions & Portrait Bench"

Cohesion: 0.17
Nodes (9): OUT_DIR, watchIntroductions(), portraits(), generated(), READ_MS, readDb(), send(), settledDb() (+1 more)

### Community 67 - "Script Protocol"

Cohesion: 0.16
Nodes (11): HookName, HookOutput, HookReturn, ScriptCard, ScriptEntity, ScriptReply, ScriptSection, handle() (+3 more)

### Community 68 - "Scenario Grid"

Cohesion: 0.23
Nodes (11): startScenario(), count(), importFile(), message(), PrePlayDialog, Props, ScenarioCard(), ScenarioGrid() (+3 more)

### Community 69 - "Stryker Config"

Cohesion: 0.13
Nodes (14): coverageAnalysis, ignorePatterns, jsonReporter, fileName, mutate, plugins, reporters, $schema (+6 more)

### Community 71 - "Own-Format Transfer"

Cohesion: 0.24
Nodes (12): AdventureExport, firstIssue(), FORMAT, Image, isRecord(), parseOwn(), renumber(), withoutBlob() (+4 more)

### Community 72 - "Structured Context Tests"

Cohesion: 0.15
Nodes (9): actions, input(), kinds, lena, orrin, scene, settings(), tamsin (+1 more)

### Community 73 - "Context Card Types"

Cohesion: 0.26
Nodes (11): CardMatch, Compiled, CardsResult, ContextBudget, ContextBuildInput, Rendered, RenderedSections, RankedMemory (+3 more)

### Community 74 - "Trace & Job Log"

Cohesion: 0.33
Nodes (9): JobKind, buildTrace(), TRACE_PROMPT_CAP, hashPrompt(), seedOf(), clearJobLog(), JobWindow, overlappingJobs() (+1 more)

### Community 75 - "Formatting & Speakers"

Cohesion: 0.21
Nodes (9): actionStoryText(), joinStory(), lastSentenceEnd(), escape(), guessSpeakers(), Named, PLAYER, cast (+1 more)

### Community 76 - "Living-Meters Hooks"

Cohesion: 0.18
Nodes (12): advanceChronometer(), callbackLog(), concludeLSI(), endContextLSI(), getStateMessage(), getTurn(), handleError(), rejoinDescription() (+4 more)

### Community 77 - "AID Import"

Cohesion: 0.23
Nodes (11): ACTION_TYPES, AidAction, AidAdventure, AidCard, each(), mapAidCards(), mapAidJson(), mapType() (+3 more)

### Community 78 - "Settings Model"

Cohesion: 0.17
Nodes (11): AdventureSettings, AppSettings, ContextSettings, ImagePreset, ImagePresetSettings, ImageSettings, MemorySettings, ModelSettings (+3 more)

### Community 79 - "Script Sandbox Prelude"

Cohesion: 0.31
Nodes (9): PRELUDE, errText(), evalIn(), logsOf(), normalise(), passThrough(), runInSandbox(), SCRIPT_NAMES (+1 more)

### Community 80 - "Context Builder"

Cohesion: 0.22
Nodes (10): AID_ORDER, AID_PREFIX, assemble(), buildContext(), STABLE_ORDER, STABLE_PREFIX, renderBody(), applyHook() (+2 more)

### Community 81 - "Action & Trace Schema"

Cohesion: 0.20
Nodes (9): Action, ActionType, GenerationStats, count, JobKind, TurnErrorKind, TurnKind, TurnOutcome (+1 more)

### Community 82 - "faceFor"

Cohesion: 0.25
Nodes (8): escape(), faceFor(), names(), one(), cast, mill, mira, orrin

### Community 83 - "Auto-Cards Turn Handling"

Cohesion: 0.24
Nodes (9): concludeEmergency(), concludeOutputBlock(), endOutputLSI(), endTurn(), getPrecedingNewlines(), getStoryError(), isDoSay(), isDoSayStory() (+1 more)

### Community 85 - "Bootstrap & Fonts"

Cohesion: 0.22
Nodes (6): @fontsource/ibm-plex-mono, @fontsource/ibm-plex-sans, @fontsource-variable/fraunces, react-dom, renders, root

### Community 86 - "Auto-Cards Memory Construct"

Cohesion: 0.25
Nodes (9): buildMemoryConstruct(), forgetStuff(), formatEntry(), getAutoCard(), insertTitle(), promptCompression(), promptGeneration(), repositionAN() (+1 more)

### Community 87 - "Auto-Cards Generation Flow"

Cohesion: 0.25
Nodes (9): doPlayerCommands(), submitRequest(), isAwaitingGeneration(), isPendingCompression(), isPendingGeneration(), logEvent(), notEmptyObj(), parseConfig() (+1 more)

### Community 88 - "Image Utilities"

Cohesion: 0.43
Nodes (6): cropSquare(), downscale(), fitWithin(), redraw(), Size, upscale()

### Community 89 - "Scene Tracking"

Cohesion: 0.32
Nodes (4): blank(), nextScene(), mill, oldSave

### Community 90 - "Auto-Cards Memory Isolation"

Cohesion: 0.32
Nodes (8): cleanSpaces(), extractCardMemories(), safeRemoveProps(), isolateMemories(), isolateNotesAndMemories(), joinMemoryBank(), prepareMemoryCompression(), removeAutoProps()

### Community 91 - "oxfmt Config"

Cohesion: 0.29
Nodes (6): ignorePatterns, printWidth, $schema, singleQuote, sortPackageJson, trailingComma

### Community 93 - "Auto-Cards Card Config"

Cohesion: 0.38
Nodes (7): getConfigureCardDescription(), getConfigureCardEntry(), getConfigureCardTemplate(), getControlVariants(), getEnableCardTemplate(), hoistWords(), prose()

### Community 94 - "Context Viewer Spec"

Cohesion: 0.47
Nodes (3): connectDemo(), openSaltRoad(), seedMemories()

### Community 95 - "Scenario Options"

Cohesion: 0.60
Nodes (4): newScenario(), newOption(), card(), tree()

### Community 97 - "knip Config"

Cohesion: 0.40
Nodes (4): entry, ignoreExportsUsedInFile, project, $schema

### Community 98 - "Measure Script"

Cohesion: 0.40
Nodes (3): env, [scenario, a, b], SCENARIOS

### Community 100 - "Speech Spec"

Cohesion: 0.67
Nodes (3): Spoken, STUB(), stubSpeech()

### Community 101 - "Prettier Config"

Cohesion: 0.50
Nodes (4): prettier, printWidth, singleQuote, trailingComma

### Community 102 - "Living-Meters Library"

Cohesion: 0.50
Nodes (3): RM, RM_CONFIG, RM_PRESETS

## Knowledge Gaps

- **15 isolated node(s):** `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@types/node`, `@types/react`, `@types/react-dom` (+10 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 652 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `text()` connect `Image Presets & Settings` to `Formatting & Speakers`, `Core Benchmarks`, `Auto-Cards Script`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **What connects `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@types/node` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Providers & Services Wiring` be split into smaller, more focused modules?**
  _Cohesion score 0.06155950752393981 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Ports & Contradiction Tests` to `Providers & Services Wiring`, `Image Presets & Settings`, `App Shell & Library`, `Action Blocks & Core UI`, `Story Card Generator`, `Memory Retrieval Fusion`, `Icons`, `Embeddings Worker`, `Entity Matching`, `HTTP & Llama Server`, `Provider & Script Ports`, `See Prompt Composition`, `package.json`, `Story Card Matching`, `Core Benchmarks`, `Gate & Template Benchmarks`, `Recall Bench`, `Canon & Scenario Seeding`, `Image Queue & Progress`, `Import/Export Transfer`, `Fake Llama Backend`, `A1111 Image Provider`, `Quick Starts & Opening`, `Idle Gen & Model Presets`, `Session Snapshot & Fixtures`, `Portraits`, `Log & Adventure Fixtures`, `Lexical Search & Content Clause`, `QuickJS Scripting`, `Memory Classification`, `Script Worker`, `Structured Context Tests`, `Formatting & Speakers`, `faceFor`, `Image Utilities`, `Scene Tracking`, `Context Builder Tests`, `Scenario Options`, `Vite Config`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `Image Presets & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.05920745920745921 - nodes in this community are weakly interconnected._
- **Why does `AutoCards()` connect `Auto-Cards Script` to `Auto-Cards Memory Heuristics`, `Image Presets & Settings`, `Auto-Cards Text Utilities`, `Living-Meters Hooks`, `Auto-Cards Construction`, `Auto-Cards Turn Handling`, `Auto-Cards Memory Construct`, `Auto-Cards Generation Flow`, `Auto-Cards Memory Isolation`, `Auto-Cards Card Config`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Should `Memory Timing & Cover Picker` be split into smaller, more focused modules?**
  _Cohesion score 0.08644067796610169 - nodes in this community are weakly interconnected._
