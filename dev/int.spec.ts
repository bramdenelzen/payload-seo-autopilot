import type { Payload, PayloadRequest } from 'payload'

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalReq, getPayload } from 'payload'
import { buildMetadata, buildRobots, buildSitemap } from 'payload-seo-autopilot/next'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { devUser } from './helpers/credentials.js'
import { seoConfig } from './seo.config.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const dbFile = path.resolve(dirname, 'int-test.db')

let payload: Payload

beforeAll(async () => {
  for (const file of [dbFile, `${dbFile}-shm`, `${dbFile}-wal`]) {
    if (existsSync(file)) {
      rmSync(file)
    }
  }
  process.env.DATABASE_URL = `file:${dbFile}`
  const { default: config } = await import('./payload.config.js')
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload?.destroy()
})

const urls = async () =>
  (await buildSitemap({ config: seoConfig, payload })).map((e) => e.url).sort()

const callEndpoint = async (endpointPath: string, body: object, withUser = true) => {
  const endpoint = payload.config.endpoints.find((e) => e.path === endpointPath)
  if (!endpoint) {
    throw new Error(`endpoint ${endpointPath} not found`)
  }
  const user = withUser
    ? (await payload.find({ collection: 'users', where: { email: { equals: devUser.email } } }))
        .docs[0]
    : undefined
  const req = await createLocalReq(
    { user: user ? { ...user, collection: 'users' } : undefined },
    payload,
  )
  ;(req as PayloadRequest & { json: () => Promise<object> }).json = () => Promise.resolve(body)
  return endpoint.handler(req)
}

describe('schema in the dev app', () => {
  it('adds SEO fields to pages and posts and a redirects collection', () => {
    for (const slug of ['pages', 'posts'] as const) {
      expect(payload.collections[slug].config.flattenedFields.some((f) => f.name === 'meta')).toBe(
        true,
      )
    }
    expect(payload.collections.redirects).toBeDefined()
  })

  it('stores meta values', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        _status: 'published',
        meta: { description: 'D', title: 'T' },
        slug: 'meta-test',
        title: 'Meta',
      },
    })
    expect(page.meta).toMatchObject({ description: 'D', title: 'T' })
    await payload.delete({ collection: 'pages', id: page.id })
  })
})

describe('sitemap', () => {
  it('lists published pages and posts with their paths, not drafts', async () => {
    expect(await urls()).toEqual([
      'http://localhost:3000',
      'http://localhost:3000/blog/zuurdesem',
      'http://localhost:3000/over-ons',
    ])
  })

  it('follows publishing and deleting', async () => {
    const draft = (
      await payload.find({
        collection: 'pages',
        draft: true,
        where: { slug: { equals: 'geheim' } },
      })
    ).docs[0]!
    await payload.update({ collection: 'pages', data: { _status: 'published' }, id: draft.id })
    expect(await urls()).toContain('http://localhost:3000/geheim')

    await payload.delete({ collection: 'pages', id: draft.id })
    expect(await urls()).not.toContain('http://localhost:3000/geheim')
  })

  it('keeps the published version when a newer draft exists', async () => {
    const about = (
      await payload.find({ collection: 'pages', where: { slug: { equals: 'over-ons' } } })
    ).docs[0]!
    await payload.update({
      collection: 'pages',
      data: { title: 'Nieuwe titel' },
      draft: true,
      id: about.id,
    })
    expect(await urls()).toContain('http://localhost:3000/over-ons')
  })

  it('has a lastModified date for every entry', async () => {
    for (const entry of await buildSitemap({ config: seoConfig, payload })) {
      expect(entry.lastModified).toBeInstanceOf(Date)
    }
  })
})

describe('metadata for seeded content', () => {
  const find = async (slug: string) =>
    (await payload.find({ collection: 'pages', depth: 1, where: { slug: { equals: slug } } }))
      .docs[0]!

  it('generates everything for a page without SEO input', async () => {
    const metadata = buildMetadata({
      collection: 'pages',
      config: seoConfig,
      doc: await find('home'),
    })
    expect(metadata.title).toEqual({ absolute: 'Home | Bakkerij Jansen' })
    expect(metadata.description).toBe(
      'Vers brood, elke ochtend. Ambachtelijk gebakken in Utrecht sinds 1952. Ons brood. Wij bakken alles zelf, met biologisch meel en veel geduld.',
    )
    expect(metadata.alternates?.canonical).toBe('http://localhost:3000')
  })

  it('uses what the editor entered, including an uploaded image', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    )
    const image = await payload.create({
      collection: 'media',
      data: { alt: 'Brood' },
      file: { data: png, mimetype: 'image/png', name: 'og.png', size: png.length },
    })
    const about = await find('over-ons')
    await payload.update({ collection: 'pages', data: { meta: { image: image.id } }, id: about.id })

    const metadata = buildMetadata({
      collection: 'pages',
      config: seoConfig,
      doc: await find('over-ons'),
    })
    expect(metadata.title).toEqual({ absolute: 'Over de bakkerij' })
    expect(metadata.description).toBe('Leer de familie achter Bakkerij Jansen kennen.')
    expect(metadata.openGraph?.images).toEqual([
      { url: expect.stringMatching(/^\/api\/media\/file\/og(-\d+)?\.png$/) },
    ])

    await payload.update({ collection: 'pages', data: { meta: { image: null } }, id: about.id })
    await payload.delete({ collection: 'media', id: image.id })
  })

  it('builds post URLs with the prefix', async () => {
    const post = (
      await payload.find({ collection: 'posts', where: { slug: { equals: 'zuurdesem' } } })
    ).docs[0]!
    const metadata = buildMetadata({ collection: 'posts', config: seoConfig, doc: post })
    expect(metadata.alternates?.canonical).toBe('http://localhost:3000/blog/zuurdesem')
    expect(metadata.description).toBe('Ons zuurdesem rijst achttien uur. Zo doen we dat.')
  })
})

describe('Auto-generate endpoints', () => {
  const body = {
    collectionSlug: 'pages',
    doc: {
      layout: [{ blockType: 'hero', heading: 'Taarten op bestelling' }],
      slug: 'taart',
      title: 'Taart',
    },
  }

  it('return rule-based text for a logged-in editor', async () => {
    const title = await callEndpoint('/plugin-seo/generate-title', body)
    expect(await title.json()).toEqual({ result: 'Taart | Bakkerij Jansen' })

    const description = await callEndpoint('/plugin-seo/generate-description', body)
    expect(await description.json()).toEqual({ result: 'Taarten op bestelling.' })

    const url = await callEndpoint('/plugin-seo/generate-url', body)
    expect(await url.json()).toEqual({ result: 'http://localhost:3000/taart' })
  })

  it('refuse anonymous requests', async () => {
    await expect(callEndpoint('/plugin-seo/generate-title', body, false)).rejects.toThrow()
  })
})

describe('robots', () => {
  it('points at the sitemap of the dev site', () => {
    vi.stubEnv('VERCEL_ENV', '')
    expect(buildRobots({ config: seoConfig }).sitemap).toBe('http://localhost:3000/sitemap.xml')
    vi.unstubAllEnvs()
  })
})
