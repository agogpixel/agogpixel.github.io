import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('devlog')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    title: 'Agogpixel Engineering Devlogs',
    description:
      'Building an A- Studio in Public — engineering dispatches, systems architecture, and game development updates from Agogpixel.',
    site: context.site ?? 'https://agogpixel.com',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.summary,
      author: post.data.author,
      categories: [post.data.track, ...post.data.tags],
      link: `/devlogs/${post.slug}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
