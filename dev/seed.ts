import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

const paragraph = (text: string) => ({
  children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  type: 'paragraph',
  version: 1,
})

export const richText = (...paragraphs: string[]) => ({
  root: {
    children: paragraphs.map(paragraph),
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root',
    version: 1,
  },
})

/**
 * Example content that shows each behaviour:
 * - Home: no SEO filled in, so everything is generated from the sections.
 * - Over ons: the editor filled in a meta title and description, which win.
 * - Geheim: a draft, which must not appear in the sitemap.
 * - A blog post under /blog, a collection without drafts.
 */
export const seed = async (payload: Payload) => {
  const { totalDocs: users } = await payload.count({
    collection: 'users',
    where: { email: { equals: devUser.email } },
  })

  if (!users) {
    await payload.create({ collection: 'users', data: devUser })
  }

  const { totalDocs: pages } = await payload.count({ collection: 'pages' })

  if (pages) {
    return
  }

  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      layout: [
        {
          blockType: 'hero',
          buttonHref: '/over-ons',
          buttonLabel: 'Over ons',
          heading: 'Vers brood, elke ochtend',
          intro: 'Ambachtelijk gebakken in Utrecht sinds 1952.',
        },
        {
          blockType: 'text',
          body: richText('Wij bakken alles zelf, met biologisch meel en veel geduld.'),
          heading: 'Ons brood',
        },
      ],
      slug: 'home',
      title: 'Home',
    },
  })

  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      layout: [
        { blockType: 'text', body: richText('Drie generaties bakkers.'), heading: 'Wie we zijn' },
      ],
      meta: {
        description: 'Leer de familie achter Bakkerij Jansen kennen.',
        title: 'Over de bakkerij',
      },
      slug: 'over-ons',
      title: 'Over ons',
    },
  })

  await payload.create({
    collection: 'pages',
    data: { _status: 'draft', slug: 'geheim', title: 'Geheime actie' },
  })

  await payload.create({
    collection: 'posts',
    data: {
      layout: richText('Ons zuurdesem rijst achttien uur. Zo doen we dat.'),
      slug: 'zuurdesem',
      title: 'Het geheim van zuurdesem',
    },
  })
}
