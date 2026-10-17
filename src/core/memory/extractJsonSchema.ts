import { z } from 'zod/mini';
import { EntityKind } from '../schema/entity';
import {
  DESCRIPTION_CHARS,
  EVENT_CHARS,
  EVENT_YOU,
  FACT_CHARS,
  GOAL_CHARS,
  LOOK_CHARS,
  MAX_ENTITIES,
  MAX_EVENTS,
  PHRASE_CHARS,
  VOICE_CHARS,
} from '../schema/extraction';
import { LOOK_KEYS } from './looks';

// llama-server compiles these into grammars; the `$schema` dialect marker is noise to it.
export const grammarOf = (s: z.ZodMiniType) => {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(s);
  return schema;
};

/** Looks one batch entity may give. [provisional] */
const MAX_LOOKS = 3;
// The JSON string inside a GBNF literal: a name may hold a quote or backslash.
const inLiteral = (s: string) => JSON.stringify(s).replace(/[\\"]/g, String.raw`\$&`);
const quoted = (s: string) => `"${inLiteral(s)}"`;
const oneOf = (xs: readonly string[]) => xs.map(quoted).join(' | ');

/**
 * `extractionJson` as GBNF with no whitespace between tokens, built from the same caps. The
 * schema's grammar lets the 12B pretty-print (~700 characters of indent a reply), so every reply ran
 * to 500 tokens with one ("Write the JSON on one line" did not stop it); so it is 260–389, uncut.
 * [measured: 2026-10-16-batch-m17-3-exp-gbnf.json]
 * `cast`: the known characters, `refersTo`'s names; none, no `refersTo`, as `extractionJson`.
 */
export const extractGrammar = (cast: readonly string[]) =>
  [
    String.raw`root ::= "{\"entities\":[" ( entity ( "," entity ){0,${MAX_ENTITIES - 1}} )? "]${cast.length ? String.raw`,\"refersTo\":{${cast.map((n) => `${inLiteral(n)}:" phrase "`).join(',')}}` : ''},\"events\":[" ( event ( "," event ){0,${MAX_EVENTS - 1}} )? "]}"`,
    // One phrase, no comma: with one the 12B listed several with a verb in ("the kobold hisses, the kobold,").
    ...(cast.length ? [String.raw`phrase ::= "\"" [^",\\\x7F\x00-\x1F]{0,${PHRASE_CHARS}} "\""`] : []),
    String.raw`event ::= "{\"what\":\"" char{1,${EVENT_CHARS}} "\",\"who\":[" who ( "," who )? "],\"at\":" [0-9]{1,6} "}"`,
    `who ::= ${oneOf([...cast, EVENT_YOU])}`,
    // Looks only for a character, and at most MAX_LOOKS: one line, the 12B still filled all eight keys ("none") for factions too and ran to the cap.
    // A voice and a goal last and only for a character, as the schema's: a cut loses them first.
    String.raw`entity ::= "{\"name\":" name ",\"kind\":" ( "\"character\"" body ( ",\"looks\":{" look ( "," look ){0,${MAX_LOOKS - 1}} "}" )? rels ( ",\"voice\":" voice )? ( ",\"goal\":" goal )? | kind body rels ) "}"`,
    String.raw`body ::= ( ",\"aliases\":[" ( str ( "," str )* )? "]" )? ",\"description\":" desc ",\"facts\":[" ( fact ( "," fact )? )? "]"`,
    String.raw`rels ::= ( ",\"relationships\":[" ( rel ( "," rel )? )? "]" )?`,
    `kind ::= ${oneOf(EntityKind.options.filter((k) => k !== 'character'))}`,
    String.raw`look ::= "\"" ( ${LOOK_KEYS.map((k) => `"${k}"`).join(' | ')} ) "\":" short`,
    String.raw`rel ::= "{\"to\":" name ",\"stance\":" short "}"`,
    // As the schema's Name: a capital first, so the grammar cannot write "the path".
    String.raw`name ::= "\"" [A-Z] [^"\\\x7F\x00-\x1F]* "\""`,
    String.raw`char ::= [^"\\\x7F\x00-\x1F] | "\\" ( ["\\/bfnrt] | "u" [0-9a-fA-F]{4} )`,
    String.raw`str ::= "\"" char* "\""`,
    String.raw`desc ::= "\"" char{0,${DESCRIPTION_CHARS}} "\""`,
    String.raw`fact ::= "\"" char{0,${FACT_CHARS}} "\""`,
    String.raw`short ::= "\"" char{0,${LOOK_CHARS}} "\""`,
    String.raw`voice ::= "\"" char{1,${VOICE_CHARS}} "\""`,
    String.raw`goal ::= "\"" char{1,${GOAL_CHARS}} "\""`,
  ].join('\n');
