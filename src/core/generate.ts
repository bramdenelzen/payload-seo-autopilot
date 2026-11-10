import type { GenerateDescription, GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'

import type { AIGenerateRequest, ResolvedCollectionOptions, SeoAutopilotConfig } from '../types.js'

import { createGenerator } from './ai.js'
import { contentText, docPath, fallbackDescription, fallbackTitle } from './meta.js'
import { absoluteUrl, resolveSiteUrl } from './site.js'

type Logger = { error: (message: string) => void }

/**
 * The functions behind plugin-seo's "Auto-generate" buttons: AI text when AI is on and
 * answers, rule-based text otherwise. A failing AI call never blocks the editor.
 */
export const createGenerateFunctions = (
  options: SeoAutopilotConfig,
  collectionOptions: Record<string, ResolvedCollectionOptions>,
) => {
  const generator = createGenerator(options.ai)
  const siteUrl = resolveSiteUrl(options.siteUrl)

  const withAI = async (request: AIGenerateRequest, fallback: string, logger?: Logger) => {
    if (!generator) {
      return fallback
    }
    try {
      return (await generator(request)) || fallback
    } catch (error) {
      logger?.error(`[seo-autopilot] AI suggestion failed, using rule-based text: ${String(error)}`)
      return fallback
    }
  }

  const request = (
    kind: AIGenerateRequest['kind'],
    doc: Record<string, unknown>,
    opts: ResolvedCollectionOptions,
    locale?: string,
  ): AIGenerateRequest => ({
    content: contentText(doc, opts),
    kind,
    locale: locale ?? options.defaultLocale ?? 'nl',
    siteName: options.siteName,
    title: typeof doc?.[opts.titleField] === 'string' ? (doc[opts.titleField] as string) : '',
  })

  const generateTitle: GenerateTitle = ({ collectionConfig, doc, locale, req }) => {
    const opts = collectionOptions[collectionConfig?.slug ?? '']
    if (!opts) {
      return options.siteName
    }
    return withAI(
      request('title', doc, opts, locale),
      fallbackTitle(doc, opts, options.siteName),
      req?.payload?.logger,
    )
  }

  const generateDescription: GenerateDescription = ({ collectionConfig, doc, locale, req }) => {
    const opts = collectionOptions[collectionConfig?.slug ?? '']
    if (!opts) {
      return ''
    }
    return withAI(
      request('description', doc, opts, locale),
      fallbackDescription(doc, opts),
      req?.payload?.logger,
    )
  }

  const generateURL: GenerateURL = ({ collectionConfig, doc }) => {
    const opts = collectionOptions[collectionConfig?.slug ?? '']
    const path = opts ? docPath(doc, opts) : null
    return path ? absoluteUrl(siteUrl, path) : ''
  }

  return { aiEnabled: Boolean(generator), generateDescription, generateTitle, generateURL }
}
