import { z } from 'zod/mini';
import { GeneratedCardJson } from '../schema/card';

// llama-server compiles this into a grammar; the `$schema` dialect marker is noise to it.
const { $schema: _dialect, ...schema } = z.toJSONSchema(GeneratedCardJson);
export const CARD_JSON_SCHEMA = schema;
