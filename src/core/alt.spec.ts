import type { CollectionConfig, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { AIGenerateAlt } from '../types.js'

import {
  ALT_BUTTON_COMPONENT,
  ALT_ENDPOINT_PATH,
  createAltEndpoint,
  parseAltBody,
  withAltButton,
} from './alt.js'

const image = Buffer.from('fake image').toString('base64')
const body = { filename: 'brood.jpg', image, locale: 'en', mediaType: 'image/jpeg' }

describe('parseAltBody', () => {
  it('accepts a base64 image with a supported type', () => {
    expect(parseAltBody(body)).toEqual(body)
  })

  it('rejects missing, unsupported or oversized input', () => {
    expect(parseAltBody(null)).toMatch(/JSON/)
    expect(parseAltBody({ ...body, mediaType: 'image/svg+xml' })).toMatch(/Only JPEG/)
    expect(parseAltBody({ ...body, image: '' })).toMatch(/missing/)
    expect(parseAltBody({ ...body, image: 'a'.repeat(8_000_001) })).toMatch(/too large/)
    expect(parseAltBody({ ...body, image: `data:image/jpeg;base64,${image}` })).toMatch(/base64/)
  })

  it('drops an invalid locale and caps the filename', () => {
    const parsed = parseAltBody({ ...body, filename: 'x'.repeat(300), locale: '<script>' })
    expect(parsed).toMatchObject({ locale: undefined })
    expect((parsed as { filename: string }).filename).toHaveLength(200)
  })
})

describe('alt endpoint', () => {
  const logger = { error: vi.fn() }
  const request = (data: unknown, user: unknown = { id: 1 }) =>
    ({ json: () => Promise.resolve(data), payload: { logger }, user }) as unknown as PayloadRequest

  const call = async (generate: AIGenerateAlt | null, req: PayloadRequest) => {
    const endpoint = createAltEndpoint(generate, { siteName: 'Bakkerij Jansen' })
    const response = await endpoint.handler(req)
    return { body: await response.json(), status: response.status }
  }

  it('is a POST endpoint at the plugin path', () => {
    const endpoint = createAltEndpoint(null, { siteName: 'B' })
    expect(endpoint).toMatchObject({ method: 'post', path: ALT_ENDPOINT_PATH })
  })

  it('returns the suggestion with the site name and default locale', async () => {
    const generate = vi.fn<AIGenerateAlt>().mockResolvedValue('Vers zuurdesembrood op een plank')
    const result = await call(generate, request({ ...body, locale: undefined }))
    expect(result).toEqual({ body: { alt: 'Vers zuurdesembrood op een plank' }, status: 200 })
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ image, locale: 'nl', siteName: 'Bakkerij Jansen' }),
    )
  })

  it('refuses anonymous users, bad input and a missing API key', async () => {
    const generate = vi.fn<AIGenerateAlt>()
    expect((await call(generate, request(body, null))).status).toBe(401)
    expect((await call(generate, request({ ...body, mediaType: 'text/html' }))).status).toBe(400)
    expect((await call(null, request(body))).status).toBe(503)
    expect(generate).not.toHaveBeenCalled()
  })

  it('logs and returns 502 when the AI call fails', async () => {
    const result = await call(() => Promise.reject(new Error('overloaded')), request(body))
    expect(result.status).toBe(502)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('overloaded'))
  })
})

describe('withAltButton', () => {
  const media = (fields: CollectionConfig['fields']): CollectionConfig => ({
    fields,
    slug: 'media',
    upload: true,
  })

  it('adds the button after the alt input, keeping existing components', () => {
    const existing = { path: '/components#Hint' }
    const result = withAltButton(
      media([{ name: 'alt', admin: { components: { afterInput: [existing] } }, type: 'text' }]),
      'alt',
      true,
    )
    const field = result.fields[0] as { admin: { components: { afterInput: unknown[] } } }
    expect(field.admin.components.afterInput).toEqual([
      existing,
      {
        clientProps: { enabled: true, endpoint: ALT_ENDPOINT_PATH, fieldName: 'alt' },
        path: ALT_BUTTON_COMPONENT,
      },
    ])
  })

  it('leaves the collection alone without a text field of that name', () => {
    const noAlt = media([{ name: 'caption', type: 'text' }])
    expect(withAltButton(noAlt, 'alt', true)).toBe(noAlt)
    const wrongType = media([{ name: 'alt', type: 'checkbox' }])
    expect(withAltButton(wrongType, 'alt', true)).toBe(wrongType)
  })

  it('does not change the original collection', () => {
    const original = media([{ name: 'alt', type: 'textarea' }])
    const result = withAltButton(original, 'alt', false)
    expect(result).not.toBe(original)
    expect(original.fields[0]).toEqual({ name: 'alt', type: 'textarea' })
  })
})
