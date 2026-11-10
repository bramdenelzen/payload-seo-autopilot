import { describe, expect, it, vi } from 'vitest'

import type { AIGenerate, SeoAutopilotConfig } from '../types.js'

import { createGenerateFunctions } from './generate.js'
import { resolveCollectionOptions } from './meta.js'

const collectionOptions = {
  pages: resolveCollectionOptions({ contentFields: ['intro'] }),
  posts: resolveCollectionOptions({ pathPrefix: '/blog' }),
}
const doc = { intro: 'Vers brood uit Utrecht.', slug: 'home', title: 'Home' }
const logger = { error: vi.fn() }
const args = (collection: string, data: object = doc, locale?: string) =>
  ({
    collectionConfig: { slug: collection },
    doc: data,
    locale,
    req: { payload: { logger } },
  }) as never

const setup = (config: Partial<SeoAutopilotConfig> = {}) =>
  createGenerateFunctions(
    { collections: {}, siteName: 'Bakkerij', siteUrl: 'https://b.nl', ...config },
    collectionOptions,
  )

const custom = (generate: AIGenerate) => ({ ai: { generate, provider: 'custom' as const } })

describe('without AI', () => {
  const fns = setup()

  it('reports AI as off', () => {
    expect(fns.aiEnabled).toBe(false)
  })

  it('generates rule-based titles and descriptions', async () => {
    expect(await fns.generateTitle(args('pages'))).toBe('Home | Bakkerij')
    expect(await fns.generateDescription(args('pages'))).toBe('Vers brood uit Utrecht.')
  })

  it('generates URLs, including a prefix and the home page', async () => {
    expect(await fns.generateURL(args('pages'))).toBe('https://b.nl')
    expect(await fns.generateURL(args('posts', { slug: 'zuurdesem' }))).toBe(
      'https://b.nl/blog/zuurdesem',
    )
    expect(await fns.generateURL(args('pages', {}))).toBe('')
  })

  it('handles collections it does not manage', async () => {
    expect(await fns.generateTitle(args('other'))).toBe('Bakkerij')
    expect(await fns.generateDescription(args('other'))).toBe('')
    expect(await fns.generateURL(args('other'))).toBe('')
  })
})

describe('with AI', () => {
  it('passes the page to the generator and returns its text', async () => {
    const generate = vi.fn<AIGenerate>().mockResolvedValue('AI tekst')
    const fns = setup(custom(generate))

    expect(fns.aiEnabled).toBe(true)
    expect(await fns.generateDescription(args('pages', doc, 'en'))).toBe('AI tekst')
    expect(generate).toHaveBeenCalledWith({
      content: 'Vers brood uit Utrecht.',
      kind: 'description',
      locale: 'en',
      siteName: 'Bakkerij',
      title: 'Home',
    })
  })

  it('uses defaultLocale, then nl, when the request has no locale', async () => {
    const generate = vi.fn<AIGenerate>().mockResolvedValue('x')
    await setup({ ...custom(generate), defaultLocale: 'de' }).generateTitle(args('pages'))
    await setup(custom(generate)).generateTitle(args('pages'))
    expect(generate.mock.calls.map(([r]) => r.locale)).toEqual(['de', 'nl'])
  })

  it('falls back to rule-based text when the generator returns nothing', async () => {
    const fns = setup(custom(() => Promise.resolve(null)))
    expect(await fns.generateTitle(args('pages'))).toBe('Home | Bakkerij')
    const empty = setup(custom(() => Promise.resolve('')))
    expect(await empty.generateDescription(args('pages'))).toBe('Vers brood uit Utrecht.')
  })

  it('falls back and logs when the generator throws', async () => {
    logger.error.mockReset()
    const fns = setup(custom(() => Promise.reject(new Error('down'))))
    expect(await fns.generateDescription(args('pages'))).toBe('Vers brood uit Utrecht.')
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('down'))
  })

  it('never uses AI for the URL', async () => {
    const generate = vi.fn<AIGenerate>()
    await setup(custom(generate)).generateURL(args('pages'))
    expect(generate).not.toHaveBeenCalled()
  })
})
