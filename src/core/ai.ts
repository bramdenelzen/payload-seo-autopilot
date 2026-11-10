import type { AIGenerate, AIGenerateRequest, AIOptions } from '../types.js'

import { DESCRIPTION_MAX, TITLE_MAX } from './meta.js'
import { truncate } from './text.js'

/** Cheap and fast enough for short meta texts. */
const DEFAULT_MODEL = 'claude-haiku-5-5'

/** Content sent to the model is capped so a long page stays cheap. */
const MAX_CONTENT_CHARS = 6000

export const buildPrompt = (request: AIGenerateRequest): string => {
  const limit = request.kind === 'title' ? TITLE_MAX : DESCRIPTION_MAX
  const what =
    request.kind === 'title'
      ? `an SEO title for this page, at most ${limit} characters. End with " | ${request.siteName}" when it fits.`
      : `an SEO meta description for this page, at most ${limit} characters, that makes a searcher want to click.`

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
  ].join('\n')
}

/**
 * Keeps the first line only (models sometimes add a second-guess like "Wait, that exceeds 60
 * characters..." after the answer), removes quotes or labels, and enforces the length limit.
 * A title that is too long loses its " | Site" suffix before it is truncated.
 */
export const cleanOutput = (text: string, kind: AIGenerateRequest['kind']): null | string => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const cleaned = firstLine
    .trim()
    .replace(/^(?:seo[- ]?)?(?:title|meta description|description)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()

  if (!cleaned) {
    return null
  }

  if (kind === 'title') {
    const suffixAt = cleaned.lastIndexOf(' | ')
    const fits = cleaned.length <= TITLE_MAX || suffixAt <= 0
    return truncate(fits ? cleaned : cleaned.slice(0, suffixAt).trim(), TITLE_MAX)
  }

  return truncate(cleaned, DESCRIPTION_MAX)
}

const anthropicGenerator = (apiKey: string, model: string): AIGenerate => {
  let client: Promise<import('@anthropic-ai/sdk').default> | undefined

  return async (request) => {
    client ??= import('@anthropic-ai/sdk').then(
      ({ default: Anthropic }) => new Anthropic({ apiKey }),
    )

    // Haiku has no server-side refusal fallback, so this is a plain request. A refusal
    // returns null and the editor gets the rule-based text instead.
    const response = await (
      await client
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

    return cleanOutput(text, request.kind)
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
    return options.generate
  }

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return null
  }

  return anthropicGenerator(apiKey, options.model ?? DEFAULT_MODEL)
}
