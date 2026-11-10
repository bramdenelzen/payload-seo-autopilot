import { describe, expect, it } from 'vitest'

import { buildPrompt, cleanOutput, createGenerator } from './ai.js'
import {
  docPath,
  fallbackDescription,
  fallbackTitle,
  resolveCollectionOptions,
  resolveMeta,
} from './meta.js'
import { extractText, truncate } from './text.js'

const lexical = (...paragraphs: string[]) => ({
  root: {
    children: paragraphs.map((text) => ({
      children: [{ text, type: 'text' }],
      type: 'paragraph',
    })),
    type: 'root',
  },
})

const pages = resolveCollectionOptions(true)

describe('extractText', () => {
  it('reads sections in order and skips links, ids and single tokens', () => {
    const layout = [
      {
        blockType: 'hero',
        heading: 'Vers brood elke ochtend',
        id: 'abc123',
        link: { label: 'Bekijk', url: '/assortiment' },
        variant: 'dark',
      },
      { blockType: 'text', body: lexical('Wij bakken sinds 1952.', 'Kom langs in Utrecht.') },
    ]

    expect(extractText(layout)).toBe(
      'Vers brood elke ochtend Wij bakken sinds 1952. Kom langs in Utrecht.',
    )
  })
})

describe('truncate', () => {
  it('keeps short text and cuts long text on a word boundary', () => {
    expect(truncate('kort', 10)).toBe('kort')
    expect(truncate('een twee drie vier vijf', 15)).toBe('een twee drie…')
  })
})

describe('meta fallbacks', () => {
  it('adds the site name to the title when it fits', () => {
    expect(fallbackTitle({ title: 'Over ons' }, pages, 'Bakkerij Jansen')).toBe(
      'Over ons | Bakkerij Jansen',
    )
    expect(fallbackTitle({ title: 'x'.repeat(58) }, pages, 'Bakkerij Jansen')).toHaveLength(58)
  })

  it('writes a description from the sections and prefers editor meta', () => {
    const doc = {
      layout: [{ blockType: 'text', body: lexical('Wij bakken sinds 1952.') }],
      title: 'Home',
    }

    expect(fallbackDescription(doc, pages)).toBe('Wij bakken sinds 1952.')
    expect(
      resolveMeta({ ...doc, meta: { description: 'Eigen tekst' } }, pages, 'B').description,
    ).toBe('Eigen tekst')
  })

  it('builds public paths', () => {
    expect(docPath({ slug: 'home' }, pages)).toBe('/')
    expect(docPath({ slug: 'over-ons' }, pages)).toBe('/over-ons')
    expect(docPath({ slug: 'post' }, resolveCollectionOptions({ pathPrefix: '/blog/' }))).toBe(
      '/blog/post',
    )
    expect(docPath({}, pages)).toBeNull()
  })
})

describe('ai', () => {
  it('is off without config or API key', () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(createGenerator(undefined)).toBeNull()
    expect(createGenerator(false)).toBeNull()
    expect(createGenerator({ provider: 'anthropic' })).toBeNull()
    expect(createGenerator({ apiKey: 'sk-test', provider: 'anthropic' })).toBeTypeOf('function')
    process.env.ANTHROPIC_API_KEY = saved
  })

  it('uses a custom generator', async () => {
    const generate = createGenerator({ generate: async () => 'ok', provider: 'custom' })
    expect(await generate?.({ content: '', kind: 'title', siteName: 'B', title: '' })).toBe('ok')
  })

  it('cleans model output and asks for the right language', () => {
    expect(cleanOutput('Title: "Vers brood | Bakkerij"', 'title')).toBe('Vers brood | Bakkerij')
    expect(cleanOutput('   ', 'description')).toBeNull()
    expect(
      buildPrompt({ content: 'x', kind: 'description', locale: 'en', siteName: 'B', title: 'T' }),
    ).toContain('"en"')
  })
})

describe('generate functions', () => {
  const args = (doc: Record<string, unknown>) =>
    ({ collectionConfig: { slug: 'pages' }, doc, locale: undefined, req: undefined }) as never

  it('uses AI text, and falls back when AI fails or is off', async () => {
    const { createGenerateFunctions } = await import('./generate.js')
    const doc = { intro: 'Vers brood.', slug: 'home', title: 'Home' }
    const opts = { pages: resolveCollectionOptions({ contentFields: ['intro'] }) }

    const ai = createGenerateFunctions(
      {
        ai: { generate: async (r) => `AI ${r.kind} ${r.locale}`, provider: 'custom' },
        collections: {},
        siteName: 'B',
      },
      opts,
    )
    expect(await ai.generateTitle(args(doc))).toBe('AI title nl')

    const broken = createGenerateFunctions(
      {
        ai: { generate: () => Promise.reject(new Error('down')), provider: 'custom' },
        collections: {},
        siteName: 'B',
      },
      opts,
    )
    expect(await broken.generateDescription(args(doc))).toBe('Vers brood.')

    const off = createGenerateFunctions(
      { collections: {}, siteName: 'B', siteUrl: 'https://b.nl' },
      opts,
    )
    expect(off.aiEnabled).toBe(false)
    expect(await off.generateTitle(args(doc))).toBe('Home | B')
    expect(await off.generateURL(args(doc))).toBe('https://b.nl')
  })
})
