import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import type { z } from 'zod/mini';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { knownAs, matchEntity, mergeEntity } from '@core/memory/entities';
import { catchUpEntities } from '@core/memory/batch';
import { HELPER_JSON_SAMPLING, passageOf, turnReadTokens } from '@core/memory/extract';
import { grammarOf } from '@core/memory/extractJsonSchema';
import { leaversOf, namedIn, nextScene } from '@core/memory/scene';
import type { HelperCallLog } from '@core/memory';
import { indexAssertions } from '@core/memory/assertionIndex';
import { deriveAssertions } from '@core/memory/assertions';
import { currentStates } from '@core/memory/looks';
import { sceneIds } from '@core/memory/names';
import { readState, stateAsk, stateCast } from '@core/memory/stateRead';
import type { Adventure, Entity, Scene } from '@core/model/types';
import { collect } from '@core/ports/provider';
import * as S from '@core/schema';
import { turnRead } from '@core/schema/extraction';
import { contentClause, withContent } from '@core/text/content';
import { EXTRACT_SYSTEM } from '@core/text/prompts';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { introducePrompt } from '@core/text/turnReadPrompt';
import { selectStructured, STRUCTURED_CAP } from '@core/context/structured';
import type { RenderedSections } from '@core/context/types';
import { renderTemplate } from '@core/text/templates';
import { writeMeasurement } from './env';
import { mergedB, parses, type Reply } from './stateReply';
import { leftWanted, onlySpan, pickSet, sceneAt, scoreLeft, scoreRows, type LeftRow, type StateRow } from './stateScore';

// Reads A (scene) and B (state of who is there) replayed over every AI turn of a backup, scored against hand labels.
// `pnpm measure state <url> <backup.storyloom.json> [label] [labels-set]`; skipped without both.
const url = process.env['MEASURE_URL'];
const backup = process.env['MEASURE_BACKUP'];
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';
const SET = process.env['MEASURE_LABELS'] ?? 'm12-dogfood';

const CAST_SETTINGS = { memoryBankEnabled: false, cacheStableLayout: false, evictionChunk: 8 };
/** `MEASURE_READS=A` skips read B; `C` replays the batch call alone. */
const READS = (process.env['MEASURE_READS'] ?? 'A,B').split(',');
/** `MEASURE_ONLY=43-44` replays those AI turns from the labelled scene; `MEASURE_REPEAT=5` reads each one 5 times (`left` per sample). */
const ONLY = onlySpan(process.env['MEASURE_ONLY']);
const REPEAT = Number(process.env['MEASURE_REPEAT'] ?? '1');
/** `MEASURE_CACHE=1` caches read A's prompt on slot 1, as core caches read B's (M17-2). */
const CACHE = process.env['MEASURE_CACHE'] === '1';
/** `MEASURE_READS=AB` asks read B inside read A's call (M17-1); its row's B fields come from that reply, with no time of their own. */
const MERGED = READS.includes('AB');
if (MERGED) READS.push('A');
/** `MEASURE_ROLES=<batch-….json>`: the roles a read C replay stored, given to the backup's characters by name (M18-2). */
const ROLES: Record<string, string[]> = process.env['MEASURE_ROLES'] ? JSON.parse(readFileSync(process.env['MEASURE_ROLES'], 'utf8')).score.roles : {};

test.skipIf(!url || !backup || !READS.some((r) => r === 'A' || r === 'B'))('state reads over a backup', { timeout: 3_600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  adv.entities = adv.entities.map((e) => (ROLES[e.name] ? { ...e, roles: ROLES[e.name] } : e));
  const set = pickSet(JSON.parse(readFileSync('bench/stateLabels.json', 'utf8')), SET);
  // A v1 backup keeps identities in entity fields: derive them as opening it would.
  const legacy = S.LegacyAdventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const identities = [...adv.assertions, ...deriveAssertions(legacy)].filter((x) => x.kind === 'identity' || x.kind === 'trait');
  const provider = new LlamaServerProvider('state', url ?? '');
  // As the app sends it: an instruct utility model must not soften the adult scenes.
  const content = contentClause(adv.settings, 'record');
  const ask = async <T>(user: string, schema: z.ZodMiniType<T>, maxTokens: number) => {
    const r = renderTemplate(adv.settings.template, withContent(EXTRACT_SYSTEM, content), user, '');
    const t0 = Date.now();
    const { text, stats } = await collect(
      provider.complete({
        prompt: r.prompt,
        maxTokens,
        temperature: 0.2,
        topP: 0.9,
        ...HELPER_JSON_SAMPLING,
        stop: r.stop,
        cachePrompt: CACHE,
        slotId: 1,
        jsonSchema: grammarOf(schema),
      }),
    );
    const parsed = parses(text) ? schema.safeParse(JSON.parse(text)).data : undefined;
    return {
      text,
      parsed,
      ms: Date.now() - t0,
      promptMs: stats?.promptMs,
      cachedTokens: stats?.cachedTokens,
      tokens: stats?.generatedTokens,
      stop: stats?.stopReason,
    };
  };

  const rows: (StateRow & { a: Reply; b?: Reply; left: LeftRow; structured: { tokens: number; text: string } })[] = [];
  const tokenizer = createApproxTokenizer();
  let before = ONLY ? ONLY.from - 1 : 0;
  let scene: Scene = ONLY ? sceneAt(set, before) : { location: set.start, present: [] };
  const places: Entity[] = ONLY && scene.location ? [mergeEntity(undefined, { name: scene.location, kind: 'place', description: '' }, 0)] : [];
  let moves = 0;
  const newPlaces: string[] = [];
  const record: Record<string, Record<string, string>> = {};
  let assertions: Adventure['assertions'] = [];
  const presence: NonNullable<Adventure['plot']['presence']> = [];
  for (let i = 2; i < adv.actions.length; i++) {
    if (adv.actions[i]?.type !== 'continue' || (ONLY && (i < ONLY.from || i > ONLY.to))) continue;
    const n = i + 1;
    const characters = adv.entities.filter((e) => e.kind === 'character' && e.firstSeen <= i);
    const cast = [...new Set(characters.flatMap((e) => [e.name, ...e.aliases]))];
    const passage = passageOf({ ...adv, actions: adv.actions.slice(0, n) }, { fromAction: Math.max(0, n - 2), toAction: n });

    // `AB` (M17-1): read B's subjects and records from the scene before this turn, asked in read A's call.
    const known = adv.entities.filter((e) => e.firstSeen <= i);
    const pre: Adventure = { ...adv, actions: adv.actions.slice(0, n), entities: known, assertions, plot: { ...adv.plot, scene: sceneIds(scene, known) } };
    const subjectsAB = MERGED ? stateCast(pre) : [];
    const q = subjectsAB.length ? stateAsk(pre, subjectsAB) : undefined;
    // Read A: the turn read from core, its scene part only (as on a turn with no new name).
    const readA = () => ask(introducePrompt(passage, [], true, scene, cast, q), turnRead(cast, [], scene.present, q), turnReadTokens([], q));
    const a = await readA();
    const samples = [a];
    for (let k = 1; k < REPEAT; k++) samples.push(await readA());
    const left = { want: leftWanted(set, before, i), samples: samples.map((s) => (s.parsed ? leaversOf(s.parsed.scene) : null)), ms: samples.map((s) => s.ms) };
    before = i;
    const read = a.parsed?.scene;
    if (read) {
      // As `introduce` does: an unknown location becomes a place card.
      if (read.location.trim() && !knownAs(places, read.location)) {
        places.push(mergeEntity(undefined, { name: read.location.trim(), kind: 'place', description: '' }, i));
        newPlaces.push(read.location.trim());
      }
      const r = nextScene(scene, read, (s) => matchEntity(characters, s)?.name, i, places, namedIn(characters, passage));
      if (r.moved) moves++;
      scene = r.scene ?? scene;
    }

    // Read B from core, on the adventure as it stood after this turn, with B's own record so far.
    const here = sceneIds(scene, known);
    // As `withScene` keeps it, so the cast prints its witnessed-by clauses.
    if (presence.at(-1)?.present.toSorted().join() !== here.present.toSorted().join()) presence.push({ at: i, present: here.present });
    const work: Adventure = {
      ...adv,
      actions: adv.actions.slice(0, n),
      entities: known,
      assertions,
      plot: { ...adv.plot, scene: here, presence },
      scriptState: {},
    };
    const calls: HelperCallLog[] = [];
    const subjects = READS.includes('B') ? stateCast(work) : [];
    const r = subjects.length
      ? await readState(work, { provider, template: adv.settings.template, content, cuts: { cutCalls: 0, finishedPastCut: 0, calls } })
      : undefined;
    const call = calls[0];
    const b = call
      ? {
          ms: call.ms,
          promptMs: call.promptMs,
          cachedTokens: call.cachedTokens,
          tokens: call.generatedTokens,
          stop: call.stopReason,
          raw: call.reply,
          parsed: parses(call.reply),
          accepted: r?.changed ?? 0,
          rejected: r?.rejected ?? [],
        }
      : q && mergedB(work, subjectsAB, q, a);
    assertions = work.assertions;
    const ix = indexAssertions(assertions);
    for (const s of MERGED ? subjectsAB : subjects) record[s.name] = currentStates(ix.of(s.id));
    // The cast block this turn would send: the backup's identities and pins as of now, B's states.
    const out: RenderedSections = new Map();
    const said = identities.filter((x) => x.at <= i);
    const used = selectStructured(
      {
        ...work,
        assertions: [...said, ...assertions],
        // Memories made by now, for the witnessed-by text; the bank itself is off.
        rankedMemories: adv.memories.filter((m) => m.toAction <= n && !m.forgotten).map((memory) => ({ memory, score: 0 })),
        settings: { ...CAST_SETTINGS, contextLength: adv.settings.model.contextLength },
        tokenizer,
      },
      i,
      0,
      STRUCTURED_CAP,
      out,
    ).structuredUsed;
    const structured = { tokens: used, text: [...out.values()].map((s) => s.text).join('\n') };

    rows.push({
      i,
      cast,
      location: scene.location,
      present: scene.present,
      record: structuredClone(record),
      a: { ms: a.ms, promptMs: a.promptMs, cachedTokens: a.cachedTokens, tokens: a.tokens, stop: a.stop, raw: a.text, parsed: !!a.parsed },
      left,
      ...(b && { b }),
      structured,
    });
    console.log('cast', i, `${structured.tokens} tokens`, `\n${structured.text}`);
    const bLine = b ? `B ${b.ms} ms ${b.stop} ${b.raw} rejected ${JSON.stringify(b.rejected)}` : '';
    console.log('state', i, `A ${a.ms} ms ${a.stop}`, bLine, '=>', scene.location, '|', scene.present.join(','));
  }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  const bs = rows.flatMap((r) => (r.b ? [r.b] : []));
  const score = {
    ...scoreRows(rows, set),
    // The bar: ≤ 4 location strings, moves = place changes; new places decide `partOf` by ask vs by rule.
    locations: new Set(rows.flatMap((r) => r.location ?? [])).size,
    moves,
    newPlaces,
    cutReplies: [...rows.map((r) => r.a), ...bs].filter((x) => x.stop === 'length').length,
    // C9: a utility model below 28/30 parsed fails the JSON bar.
    parsedA: rows.filter((r) => r.a.parsed).length,
    parsedB: bs.filter((x) => x.parsed).length,
    meanMsA: mean(rows.map((r) => r.a.ms)),
    ...scoreLeft(rows.map((r) => r.left)),
    meanMsB: mean(bs.map((x) => x.ms)),
    // M17-1's bar: helper time per turn, both reads (one call under `AB`).
    meanMsTurn: mean(rows.map((r) => r.a.ms + (r.b?.ms ?? 0))),
    meanPromptMsA: mean(rows.flatMap((r) => r.a.promptMs ?? [])),
    meanPromptMsB: mean(bs.flatMap((x) => x.promptMs ?? [])),
    meanCachedA: mean(rows.flatMap((r) => r.a.cachedTokens ?? [])),
    meanCachedB: mean(bs.flatMap((x) => x.cachedTokens ?? [])),
    // C8: above 20 % the next item loosens the subject rule.
    stateAccepted: bs.reduce((s, x) => s + (x.accepted ?? 0), 0),
    stateRejected: bs.reduce((s, x) => s + (x.rejected?.filter((y) => y.reason !== 'ungrounded').length ?? 0), 0),
    // M17-4: proposed, not sent (the record holds sent values only); `unchanged` must not rise.
    stateUngrounded: bs.reduce((s, x) => s + (x.rejected?.filter((y) => y.reason === 'ungrounded').length ?? 0), 0),
    stateUnchanged: bs.reduce((s, x) => s + (x.rejected?.filter((y) => y.reason === 'unchanged').length ?? 0), 0),
    // M18-2: a role ("the kobold") names its character, so these fall.
    stateWrongSubject: bs.reduce((s, x) => s + (x.rejected?.filter((y) => y.reason === 'wrong-subject').length ?? 0), 0),
    // M13-5's bar: ≤ 200 with three present.
    maxStructured: Math.max(0, ...rows.map((r) => r.structured.tokens)),
    maxStructuredThreePresent: Math.max(0, ...rows.filter((r) => r.present.length >= 3).map((r) => r.structured.tokens)),
  };
  console.log('state score', JSON.stringify(score));
  console.log('wrote', writeMeasurement(`state-${LABEL}`, { url, backup, set: SET, sampling: HELPER_JSON_SAMPLING, score, rows }));
});

// Read C: the batch call from core at memory cadence (`catchUpEntities`, so a cut reply re-reads), from no cards, so every identity is a new name's (read D).
test.skipIf(!url || !backup || !READS.includes('C'))('batch call over a backup', { timeout: 3_600_000 }, async () => {
  const adv = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const provider = new LlamaServerProvider('state', url ?? '');
  const work: Adventure = { ...adv, entities: [], assertions: [], scriptState: {} };
  const replies = [];
  for (;;) {
    const calls: HelperCallLog[] = [];
    const before = new Set(work.assertions.map((a) => a.id));
    const fromAction = work.scriptState.__entitiesAt ?? 0;
    await catchUpEntities(work, { provider, template: adv.settings.template, cuts: { cutCalls: 0, finishedPastCut: 0, calls } });
    if (!calls.length) break;
    // How far the marker advanced: past the first memory only after a cut.
    const range = { fromAction, toAction: work.scriptState.__entitiesAt ?? 0 };
    const name = (id: string) => work.entities.find((e) => e.id === id)?.name;
    const added = work.assertions.filter((a) => !before.has(a.id));
    const identities = added.flatMap((a) => (a.kind === 'identity' ? [{ name: name(a.subject), text: a.text, span: a.span }] : []));
    // M19-5: by name, to label subject swaps by hand.
    const events = added.flatMap((a) => (a.kind === 'event' ? [{ at: a.at, who: a.who.map((id) => name(id) ?? id), text: a.text, span: a.span }] : []));
    // M20-4: by name, to rate against the character's quoted lines.
    const voices = added.flatMap((a) => (a.kind === 'voice' ? [{ name: name(a.subject), text: a.text }] : []));
    const c = calls[0];
    const call = { ms: c?.ms, tokens: c?.generatedTokens, stop: c?.stopReason, facts: c?.factsProposed, raw: c?.reply };
    replies.push({ range, ...call, identities, events, voices, rejected: c?.rejected });
    console.log('batch', range, `${c?.ms} ms ${c?.generatedTokens} tokens ${c?.stopReason}`, JSON.stringify(identities), JSON.stringify(c?.rejected));
  }
  const proposals = (work.scriptState.__aliasProposals ?? []).map((p) => ({ name: p.name, of: work.entities.find((e) => e.id === p.of)?.name }));
  const score = {
    calls: replies.length,
    cut: replies.filter((r) => r.stop === 'length').length,
    meanMs: Math.round(replies.reduce((s, r) => s + (r.ms ?? 0), 0) / Math.max(1, replies.length)),
    factsProposed: replies.reduce((s, r) => s + (r.facts ?? 0), 0),
    events: replies.reduce((s, r) => s + r.events.length, 0),
    voices: replies.reduce((s, r) => s + r.voices.length, 0),
    noDialogue: replies.reduce((s, r) => s + (r.rejected?.filter((x) => x.reason === 'no-dialogue').length ?? 0), 0),
    maxTokens: Math.max(0, ...replies.map((r) => r.tokens ?? 0)),
    cards: work.entities.map((e) => e.name),
    roles: Object.fromEntries(work.entities.map((e) => [e.name, e.roles ?? []])),
    proposals,
    // M18-4: an identity whose species the looks contradict.
    species: work.assertions.flatMap((a) =>
      a.kind === 'conflict' ? [`${work.entities.find((e) => e.id === a.subject)?.name}:${a.claimed} vs ${a.canon}`] : [],
    ),
  };
  console.log('batch score', JSON.stringify(score));
  console.log('wrote', writeMeasurement(`batch-${LABEL}`, { url, backup, sampling: HELPER_JSON_SAMPLING, score, replies }));
});
