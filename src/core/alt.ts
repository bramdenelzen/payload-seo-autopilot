import type { CollectionConfig, Endpoint, Field } from 'payload'

import type { AIAltRequest, AIGenerateAlt, SeoAutopilotConfig } from '../types.js'

export const ALT_ENDPOINT_PATH = '/seo-autopilot/generate-alt'

export const ALT_BUTTON_COMPONENT = 'payload-seo-autopilot/client#GenerateAltButton'

const MEDIA_TYPES = new Set<string>(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

/** Roughly 6 MB of image data. The browser sends a scaled-down copy, so this is generous. */
const MAX_IMAGE_CHARS = 8_000_000

type Logger = { error: (message: string) => void }

/**
 * Checks the request body. Returns an error message, or the parsed request without
 * `siteName`.
 */
export const parseAltBody = (body: unknown): Omit<AIAltRequest, 'siteName'> | string => {
  if (!body || typeof body !== 'object') {
    return 'Expected a JSON body.'
  }
  const { filename, image, locale, mediaType } = body as Record<string, unknown>

  if (typeof mediaType !== 'string' || !MEDIA_TYPES.has(mediaType)) {
    return 'Only JPEG, PNG, WebP and GIF images are supported.'
  }
  if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_CHARS) {
    return 'The image is missing or too large.'
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    return 'The image must be base64 without a data: prefix.'
  }

  return {
    filename: typeof filename === 'string' ? filename.slice(0, 200) : undefined,
    image,
    locale:
      typeof locale === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(locale)
        ? locale
        : undefined,
    mediaType: mediaType as AIAltRequest['mediaType'],
  }
}

/** POST /api/seo-autopilot/generate-alt: alt text for an image, for logged-in users only. */
export const createAltEndpoint = (
  generate: AIGenerateAlt | null,
  options: Pick<SeoAutopilotConfig, 'defaultLocale' | 'siteName'>,
): Endpoint => ({
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!generate) {
      return Response.json({ error: 'AI is off: no API key found.' }, { status: 503 })
    }

    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      body = null
    }

    const parsed = parseAltBody(body)
    if (typeof parsed === 'string') {
      return Response.json({ error: parsed }, { status: 400 })
    }

    try {
      const alt = await generate({
        ...parsed,
        locale: parsed.locale ?? options.defaultLocale ?? 'nl',
        siteName: options.siteName,
      })
      return Response.json({ alt })
    } catch (error) {
      ;(req.payload?.logger as Logger | undefined)?.error(
        `[seo-autopilot] Alt text suggestion failed: ${String(error)}`,
      )
      return Response.json({ error: 'The AI suggestion failed.' }, { status: 502 })
    }
  },
  method: 'post',
  path: ALT_ENDPOINT_PATH,
})

/**
 * Adds the button under the alt field. Returns the collection unchanged when it has no
 * top-level text or textarea field with that name. With `enabled: false` (no AI) the button
 * renders nothing.
 */
export const withAltButton = (
  collection: CollectionConfig,
  fieldName: string,
  enabled: boolean,
): CollectionConfig => {
  let found = false
  const fields = collection.fields.map((field): Field => {
    if (
      !('name' in field) ||
      field.name !== fieldName ||
      (field.type !== 'text' && field.type !== 'textarea')
    ) {
      return field
    }
    found = true
    return {
      ...field,
      admin: {
        ...field.admin,
        components: {
          ...field.admin?.components,
          afterInput: [
            ...(field.admin?.components?.afterInput ?? []),
            {
              clientProps: { enabled, endpoint: ALT_ENDPOINT_PATH, fieldName },
              path: ALT_BUTTON_COMPONENT,
            },
          ],
        },
      },
    } as Field
  })

  return found ? { ...collection, fields } : collection
}
