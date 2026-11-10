import type { Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { seoAutopilot } from './index.js'

const baseConfig = (): Config =>
  ({
    collections: [
      {
        fields: [
          { name: 'title', type: 'text' },
          { name: 'slug', type: 'text' },
        ],
        slug: 'pages',
      },
      { fields: [], slug: 'media', upload: true },
    ],
  }) as unknown as Config

describe('seoAutopilot', () => {
  it('adds the SEO tab and the redirects collection', () => {
    const config = seoAutopilot({ collections: { pages: true }, siteName: 'B' })(baseConfig())
    const pages = config.collections?.find((c) => c.slug === 'pages')

    expect(JSON.stringify(pages?.fields)).toContain('"name":"meta"')
    expect(config.collections?.some((c) => c.slug === 'redirects')).toBe(true)
    expect(config.onInit).toBeTypeOf('function')
  })

  it('can leave out the wrapped plugins and be disabled', () => {
    const config = seoAutopilot({
      collections: { pages: true },
      redirects: false,
      seo: false,
      siteName: 'B',
    })(baseConfig())

    expect(config.collections?.some((c) => c.slug === 'redirects')).toBe(false)
    expect(seoAutopilot({ collections: {}, disabled: true, siteName: 'B' })(baseConfig())).toEqual(
      baseConfig(),
    )
  })

  it('refuses a collection that already has meta fields, and unknown collections', () => {
    const doubled = seoAutopilot({ collections: { pages: true }, siteName: 'B' })(baseConfig())

    expect(() => seoAutopilot({ collections: { pages: true }, siteName: 'B' })(doubled)).toThrow(
      /already has a "meta" field/,
    )
    expect(() =>
      seoAutopilot({ collections: { posts: true }, siteName: 'B' })(baseConfig()),
    ).toThrow(/"posts" was not found/)
  })
})
