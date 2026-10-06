import { z } from 'zod/mini';
import { ExtractionJson } from '../schema/extraction';

// llama-server compiles this into a grammar; the `$schema` dialect marker is noise to it.
const { $schema: _dialect, ...schema } = z.toJSONSchema(ExtractionJson);
export const EXTRACT_JSON_SCHEMA = schema;
