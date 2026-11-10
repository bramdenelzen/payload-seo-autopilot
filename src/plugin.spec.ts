import type { Config, Field } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { seoAutopilot } from './index.js'

const baseConfig = (extraFields: Field[] = []): Config =>
  ({
    collections: [
      {
        fields: [{ name: 'title', type: 'text' }, { name: 'slug', type: 'text' }, ...extraFields],
        slug: 'pages',
      },
      { fields: [{ name: 'title', type: 'text' }], slug: 'posts' },
      { fields: [], slug: 'media', upload: true },
    ],
  }) as unknown as Config

const collection = (config: Config, slug: string) =>
  config.collections?.find((c) => c.slug === slug)
const json = (value: unknown) => JSON.stringify(value)

describe('seoAutopilot', () => {
  it('adds the SEO tab to every configured collection only', () => {
    const config = seoAutopilot({ collections: { pages: true, posts: true }, siteName: 'B' })(
      baseConfig(),
    )
    expect(json(collection(config, 'pages')?.fields)).toContain('"name":"meta"')
    expect(json(collection(config, 'posts')?.fields)).toContain('"name":"meta"')
    expect(json(collection(config, 'media')?.fields)).not.toContain('"name":"meta"')
  })

  it('puts content and SEO in tabs, and registers the generate endpoints', () => {
    const config = seoAutopilot({ collections: { pages: true }, siteName: 'B' })(baseConfig())
    const fields = collection(config, 'pages')?.fields ?? []
    expect(fields[0]?.type).toBe('tabs')
    const paths = (config.endpoints ?? []).map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining(['/plugin-seo/generate-title', '/plugin-seo/generate-description']),
    )
  })

  it('adds the redirects collection pointing at the configured collections', () => {
    const config = seoAutopilot({ collections: { pages: true, posts: true }, siteName: 'B' })(
      baseConfig(),
    )
    const redirects = collection(config, 'redirects')
    expect(redirects).toBeDefined()
    expect(json(redirects?.fields)).toContain('"relationTo":["pages","posts"]')
  })

  it('passes options through to the wrapped plugins', () => {
    const config = seoAutopilot({
      collections: { pages: true },
      redirects: { overrides: { slug: 'doorverwijzingen' } },
      seo: { tabbedUI: false },
      siteName: 'B',
    })(baseConfig())
    expect(collection(config, 'doorverwijzingen')).toBeDefined()
    expect(collection(config, 'pages')?.fields[0]?.type).not.toBe('tabs')
  })

  it('can leave out each wrapped plugin', () => {
    const noRedirects = seoAutopilot({
      collections: { pages: true },
      redirects: false,
      siteName: 'B',
    })(baseConfig())
    expect(collection(noRedirects, 'redirects')).toBeUndefined()

    const noSeo = seoAutopilot({ collections: { pages: true }, seo: false, siteName: 'B' })(
      baseConfig(),
    )
    expect(json(collection(noSeo, 'pages')?.fields)).not.toContain('"name":"meta"')
  })

  it('does nothing when disabled', () => {
    expect(
      seoAutopilot({ collections: { nope: true }, disabled: true, siteName: 'B' })(baseConfig()),
    ).toEqual(baseConfig())
  })

  it('refuses unknown collections', () => {
    expect(() =>
      seoAutopilot({ collections: { blog: true }, siteName: 'B' })(baseConfig()),
    ).toThrow(/"blog" was not found/)
  })

  it('refuses collections that already have meta fields, also inside tabs', () => {
    const doubled = seoAutopilot({ collections: { pages: true }, siteName: 'B' })(baseConfig())
    expect(() => seoAutopilot({ collections: { pages: true }, siteName: 'B' })(doubled)).toThrow(
      /already has a "meta" field/,
    )

    const inTab = baseConfig([
      { tabs: [{ fields: [{ name: 'meta', type: 'text' }], label: 'SEO' }], type: 'tabs' },
    ])
    expect(() => seoAutopilot({ collections: { pages: true }, siteName: 'B' })(inTab)).toThrow(
      /already has a "meta" field/,
    )

    // With seo: false an own meta field is fine.
    expect(() =>
      seoAutopilot({ collections: { pages: true }, seo: false, siteName: 'B' })(doubled),
    ).not.toThrow()
  })

  it('keeps an existing onInit and logs when AI has no key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const previous = vi.fn()
    const info = vi.fn()
    const config = seoAutopilot({
      ai: { provider: 'anthropic' },
      collections: { pages: true },
      siteName: 'B',
    })({
      ...baseConfig(),
      onInit: previous,
    })
    await config.onInit?.({ logger: { info } } as never)
    expect(previous).toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('AI suggestions are off'))

    info.mockReset()
    const quiet = seoAutopilot({ collections: { pages: true }, siteName: 'B' })(baseConfig())
    await quiet.onInit?.({ logger: { info } } as never)
    expect(info).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
