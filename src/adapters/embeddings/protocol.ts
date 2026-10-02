import { z } from 'zod/mini';

/** Model id under `public/models/`. [provisional] bge-small-en-v1.5 q8, 384d; compare against nomic at Gate V. */
export const EMBED_MODEL = 'bge-small-en-v1.5';

export const Vectors = z.array(z.array(z.number()));

export const EmbedRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('init') }),
  z.object({ type: z.literal('embed'), id: z.int(), texts: z.array(z.string()) }),
]);
export type EmbedRequest = z.infer<typeof EmbedRequest>;

export const EmbedReply = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('result'), id: z.int(), vectors: Vectors }),
  /** No id: the init failed. */
  z.object({ type: z.literal('error'), id: z.optional(z.int()), message: z.string() }),
]);
export type EmbedReply = z.infer<typeof EmbedReply>;
