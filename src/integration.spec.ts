import type { Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildConfig, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildMetadata, buildRobots, buildSitemap } from './exports/next.js'
import { defineSeoConfig, seoAutopilot } from './index.js'

const seo = defineSeoConfig({
  collections: { pages: { contentFields: ['intro'] } },
  siteName: 'Bakkerij Jansen',
  siteUrl: 'https://www.bakkerij.nl',
})

let payload: Payload
const dir = mkdtempSync(path.join(tmpdir(), 'seo-autopilot-'))

beforeAll(async () => {
  payload = await getPayload({
    config: buildConfig({
      collections: [
        {
          access: { read: () => true },
          fields: [
            { name: 'title', type: 'text' },
            { name: 'slug', type: 'text' },
            { name: 'intro', type: 'textarea' },
          ],
          slug: 'pages',
          versions: { drafts: true },
        },
        { fields: [], slug: 'media', upload: { staticDir: path.join(dir, 'media') } },
      ],
      db: sqliteAdapter({ client: { url: `file:${path.join(dir, 'test.db')}` } }),
      plugins: [seoAutopilot(seo)],
      secret: 'test-secret',
      telemetry: false,
    }),
  })

  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      intro: 'Vers brood, elke ochtend gebakken in Utrecht.',
      slug: 'home',
      title: 'Home',
    },
  })
  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      meta: { title: 'Over de bakkerij' },
      slug: 'over-ons',
      title: 'Over ons',
    },
  })
  await payload.create({
    collection: 'pages',
    data: { _status: 'draft', slug: 'geheim', title: 'Geheim' },
  })
}, 60_000)

afterAll(async () => {
  await payload?.destroy()
  rmSync(dir, { force: true, recursive: true })
})

describe('next helpers against a real Payload', () => {
  it('lists only published pages in the sitemap', async () => {
    const urls = (await buildSitemap({ config: seo, payload })).map((e) => e.url).sort()
    expect(urls).toEqual(['https://www.bakkerij.nl', 'https://www.bakkerij.nl/over-ons'])
  })

  it('builds metadata with fallbacks and editor values', async () => {
    const { docs } = await payload.find({
      collection: 'pages',
      sort: 'slug',
      where: { _status: { equals: 'published' } },
    })
    const home = buildMetadata({
      collection: 'pages',
      config: seo,
      doc: docs.find((d) => d.slug === 'home')!,
    })
    const about = buildMetadata({
      collection: 'pages',
      config: seo,
      doc: docs.find((d) => d.slug === 'over-ons')!,
    })

    expect(home.title).toEqual({ absolute: 'Home | Bakkerij Jansen' })
    expect(home.description).toBe('Vers brood, elke ochtend gebakken in Utrecht.')
    expect(home.alternates?.canonical).toBe('https://www.bakkerij.nl')
    expect(about.title).toEqual({ absolute: 'Over de bakkerij' })
  })

  it('blocks indexing on Vercel previews', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(buildRobots({ config: seo }).rules).toEqual({ disallow: '/', userAgent: '*' })
    delete process.env.VERCEL_ENV
    expect(buildRobots({ config: seo }).sitemap).toBe('https://www.bakkerij.nl/sitemap.xml')
  })
})
