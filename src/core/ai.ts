import type { AIGenerate, AIGenerateRequest, AIOptions } from '../types.js'

import { DESCRIPTION_MAX, TITLE_MAX } from './meta.js'
import { truncate } from './text.js'

const DEFAULT_MODEL = 'claude-opus-5-5'

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
    'Use only facts from the page. Reply with the text only, no quotes or explanation.',
    '',
    `Website: ${request.siteName}`,
    `Page title: ${request.title || '(none)'}`,
    'Page content:',
    request.content.slice(0, MAX_CONTENT_CHARS) || '(no content yet)',
  ].join('\n')
}

/** Removes quotes or labels a model sometimes adds, and enforces the length limit. */
export const cleanOutput = (text: string, kind: AIGenerateRequest['kind']): null | string => {
  const cleaned = text
    .trim()
    .replace(/^(?:seo[- ]?)?(?:title|meta description|description)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()

  if (!cleaned) {
    return null
  }

  return truncate(cleaned, kind === 'title' ? TITLE_MAX : DESCRIPTION_MAX)
}

const anthropicGenerator = (apiKey: string, model: string): AIGenerate => {
  let client: Promise<import('@anthropic-ai/sdk').default> | undefined

  return async (request) => {
    client ??= import('@anthropic-ai/sdk').then(
      ({ default: Anthropic }) => new Anthropic({ apiKey }),
    )

    const response = await (
      await client
    ).beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
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
