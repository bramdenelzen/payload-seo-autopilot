import type {
  AIAltRequest,
  AIGenerate,
  AIGenerateAlt,
  AIGenerateRequest,
  AIOptions,
} from '../types.js'

import { LENGTH_LIMITS } from './meta.js'
import { truncate } from './text.js'

/** Cheap and fast enough for short meta texts. */
const DEFAULT_MODEL = 'claude-haiku-5-5'

/** Content sent to the model is capped so a long page stays cheap. */
const MAX_CONTENT_CHARS = 6000

/** Attempts per suggestion: the first answer plus up to two corrections of its length. */
const MAX_ATTEMPTS = 3

const lengthRange = (kind: AIGenerateRequest['kind']) =>
  `between ${LENGTH_LIMITS[kind].min} and ${LENGTH_LIMITS[kind].max} characters`

export const buildPrompt = (request: AIGenerateRequest): string => {
  const what =
    request.kind === 'title'
      ? `an SEO title for this page, ${lengthRange('title')}. End with " | ${request.siteName}" when it fits.`
      : `an SEO meta description for this page, ${lengthRange('description')}, that makes a searcher want to click.`

  const correction = request.previous
    ? [
        '',
        `Your earlier answer was "${request.previous}". It has ${request.previous.length} characters, which is too ${request.previous.length < LENGTH_LIMITS[request.kind].min ? 'short' : 'long'}.`,
        `Write a corrected version of ${lengthRange(request.kind)}.`,
      ]
    : []

  return [
    `Write ${what}`,
    `Write it in the language with code "${request.locale ?? 'nl'}".`,
    'Use only facts from the page.',
    'Reply with the final text only, on one line: no quotes, no explanation, no character counts.',
    '',
    `Website: ${request.siteName}`,
    `Page title: ${request.title || '(none)'}`,
    'Page content:',
    request.content.slice(0, MAX_CONTENT_CHARS) || '(no content yet)',
    ...correction,
  ].join('\n')
}

/**
 * Keeps the first line only (models sometimes add a second-guess like "Wait, that exceeds 60
 * characters..." after the answer) and removes quotes or labels. A title that is too long
 * loses its " | Site" suffix. The length is not enforced here: see `cleanOutput`.
 */
export const cleanText = (text: string, kind: AIGenerateRequest['kind']): null | string => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const cleaned = firstLine
    .trim()
    .replace(/^(?:seo[- ]?)?(?:title|meta description|description)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()

  if (!cleaned) {
    return null
  }

  if (kind === 'title' && cleaned.length > LENGTH_LIMITS.title.max) {
    const suffixAt = cleaned.lastIndexOf(' | ')
    return suffixAt > 0 ? cleaned.slice(0, suffixAt).trim() : cleaned
  }

  return cleaned
}

/** `cleanText`, cut to the maximum length. */
export const cleanOutput = (text: string, kind: AIGenerateRequest['kind']): null | string => {
  const cleaned = cleanText(text, kind)
  return cleaned === null ? null : truncate(cleaned, LENGTH_LIMITS[kind].max)
}

/** How far a text's length is outside the advised range; 0 when it is inside. */
export const lengthMiss = (text: string, kind: AIGenerateRequest['kind']): number => {
  const { max, min } = LENGTH_LIMITS[kind]
  return text.length < min ? min - text.length : Math.max(0, text.length - max)
}

/**
 * A title that is too short gets " | Site name" when that brings it closer to the range,
 * which saves a retry.
 */
const withSiteName = (text: string, request: AIGenerateRequest): string => {
  if (request.kind !== 'title' || text.includes(request.siteName)) {
    return text
  }
  const longer = `${text} | ${request.siteName}`
  return lengthMiss(longer, 'title') < lengthMiss(text, 'title') &&
    longer.length <= LENGTH_LIMITS.title.max
    ? longer
    : text
}

/**
 * Models are bad at counting characters, so the length is checked here. An answer outside
 * plugin-seo's advised range is sent back once or twice with its length, and the closest
 * answer wins. The result never exceeds the maximum.
 */
export const withLengthCheck =
  (generate: AIGenerate): AIGenerate =>
  async (request) => {
    let best: null | string = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const raw = await generate(
        attempt === 0 ? request : { ...request, previous: best ?? undefined },
      )
      const text = raw ? cleanText(raw, request.kind) : null

      if (!text) {
        break
      }

      const candidate = withSiteName(text, request)

      if (best === null || lengthMiss(candidate, request.kind) < lengthMiss(best, request.kind)) {
        best = candidate
      }
      if (lengthMiss(best, request.kind) === 0) {
        break
      }
    }

    return best === null ? null : truncate(best, LENGTH_LIMITS[request.kind].max)
  }

type AnthropicClient = import('@anthropic-ai/sdk').default

/** The SDK is only loaded on the first AI call, so sites without AI never load it. */
const lazyClient = (apiKey: string) => {
  let client: Promise<AnthropicClient> | undefined
  return () =>
    (client ??= import('@anthropic-ai/sdk').then(
      ({ default: Anthropic }) => new Anthropic({ apiKey }),
    ))
}

const anthropicGenerator = (apiKey: string, model: string): AIGenerate => {
  const client = lazyClient(apiKey)

  return async (request) => {
    // Haiku has no server-side refusal fallback, so this is a plain request. A refusal
    // returns null and the editor gets the rule-based text instead.
    const response = await (
      await client()
    ).messages.create({
      max_tokens: 1024,
      messages: [{ content: buildPrompt(request), role: 'user' }],
      model,
      output_config: { effort: 'low' },
    })

    if (response.stop_reason === 'refusal') {
      return null
    }

    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')

    return cleanText(text, request.kind)
  }
}

/**
 * Turns the AI config into a generator, or `null` when AI is off. AI is off when it is not
 * configured, set to `false`, or when the Anthropic provider has no API key.
 */
export const createGenerator = (options: AIOptions | false | undefined): AIGenerate | null => {
  if (!options) {
    return null
  }

  if (options.provider === 'custom') {
    return withLengthCheck(options.generate)
  }

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return null
  }

  return withLengthCheck(anthropicGenerator(apiKey, options.model ?? DEFAULT_MODEL))
}

/** Screen readers read alt text in one go; around 125 characters is the common advice. */
export const ALT_MAX = 125

export const buildAltPrompt = (request: AIAltRequest): string =>
  [
    `Write alt text for this image on the website "${request.siteName}", at most ${ALT_MAX} characters.`,
    `Write it in the language with code "${request.locale ?? 'nl'}".`,
    'Describe what is visible and matters to a visitor who cannot see it. Do not start with "image of" or "photo of".',
    request.filename ? `The file is called "${request.filename}".` : '',
    'Reply with the alt text only, on one line: no quotes, no explanation.',
  ]
    .filter(Boolean)
    .join('\n')

/** First line without quotes or a label, cut to `ALT_MAX`. */
export const cleanAlt = (text: string): null | string => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const cleaned = firstLine
    .trim()
    .replace(/^alt(?:[- ]?text)?\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
  return cleaned ? truncate(cleaned, ALT_MAX) : null
}

const anthropicAltGenerator = (apiKey: string, model: string): AIGenerateAlt => {
  const client = lazyClient(apiKey)

  return async (request) => {
    const response = await (
      await client()
    ).messages.create({
      max_tokens: 1024,
      messages: [
        {
          content: [
            {
              source: { data: request.image, media_type: request.mediaType, type: 'base64' },
              type: 'image',
            },
            { text: buildAltPrompt(request), type: 'text' },
          ],
          role: 'user',
        },
      ],
      model,
      output_config: { effort: 'low' },
    })

    if (response.stop_reason === 'refusal') {
      return null
    }

    return cleanAlt(
      response.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
    )
  }
}

/**
 * The alt text generator, or `null` when AI is off or a custom provider has no
 * `generateAlt`.
 */
export const createAltGenerator = (
  options: AIOptions | false | undefined,
): AIGenerateAlt | null => {
  if (!options) {
    return null
  }

  if (options.provider === 'custom') {
    const generateAlt = options.generateAlt
    return generateAlt
      ? async (request) => {
          const text = await generateAlt(request)
          return text ? cleanAlt(text) : null
        }
      : null
  }

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
  return apiKey ? anthropicAltGenerator(apiKey, options.model ?? DEFAULT_MODEL) : null
}
