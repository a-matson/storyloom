import { z } from 'zod/mini';
import { ExtractionJson } from '../schema/extraction';

// llama-server compiles these into grammars; the `$schema` dialect marker is noise to it.
export const grammarOf = (s: z.ZodMiniType) => {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(s);
  return schema;
};
export const EXTRACT_JSON_SCHEMA = grammarOf(ExtractionJson);
