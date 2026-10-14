import { defineCollection, z } from 'astro:content';

const devlogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    track: z.string(),
    tags: z.array(z.string()),
    author: z.string(),
    summary: z.string(),
  }),
});

export const collections = {
  devlog: devlogCollection,
};
