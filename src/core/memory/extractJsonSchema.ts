import { z } from 'zod/mini';
import { ExtractionJson, IntroductionJson } from '../schema/extraction';

// llama-server compiles these into grammars; the `$schema` dialect marker is noise to it.
const grammar = (s: z.ZodMiniType) => {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(s);
  return schema;
};
export const EXTRACT_JSON_SCHEMA = grammar(ExtractionJson);
export const INTRODUCE_JSON_SCHEMA = grammar(IntroductionJson);
