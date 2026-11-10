import type { Config, Field } from 'payload'

import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'

import type { SeoAutopilotConfig } from './types.js'

import { createGenerateFunctions } from './core/generate.js'
import { resolveCollectionOptions } from './core/meta.js'

export type {
  AIGenerate,
  AIGenerateRequest,
  AIOptions,
  CollectionSeoOptions,
  SeoAutopilotConfig,
} from './types.js'

/** Identity helper so the same typed config can be shared with `payload-seo-autopilot/next`. */
export const defineSeoConfig = (config: SeoAutopilotConfig): SeoAutopilotConfig => config

const hasTopLevelField = (fields: Field[], name: string): boolean =>
  fields.some(
    (field) =>
      ('name' in field && field.name === name) ||
      (field.type === 'tabs' &&
        field.tabs.some(
          (tab) => ('name' in tab && tab.name === name) || hasTopLevelField(tab.fields, name),
        )),
  )

export const seoAutopilot =
  (options: SeoAutopilotConfig) =>
  (incoming: Config): Config => {
    if (options.disabled) {
      return incoming
    }

    let config = incoming
    const slugs = Object.keys(options.collections)
    const collectionOptions = Object.fromEntries(
      slugs.map((slug) => [slug, resolveCollectionOptions(options.collections[slug])]),
    )

    for (const slug of slugs) {
      const collection = config.collections?.find((c) => c.slug === slug)

      if (!collection) {
        throw new Error(`[seo-autopilot] Collection "${slug}" was not found in the Payload config.`)
      }

      if (options.seo !== false && hasTopLevelField(collection.fields, 'meta')) {
        throw new Error(
          `[seo-autopilot] "${slug}" already has a "meta" field. Remove the separate seoPlugin() ` +
            'or set `seo: false` in seoAutopilot().',
        )
      }
    }

    const generators = createGenerateFunctions(options, collectionOptions)

    if (options.seo !== false) {
      config = seoPlugin({
        collections: slugs,
        generateDescription: generators.generateDescription,
        generateTitle: generators.generateTitle,
        generateURL: generators.generateURL,
        tabbedUI: true,
        uploadsCollection: options.uploadsCollection ?? 'media',
        ...options.seo,
      })(config)
    }

    if (options.redirects !== false) {
      config = redirectsPlugin({
        collections: slugs,
        ...options.redirects,
      })(config)
    }

    const previousOnInit = config.onInit
    config.onInit = async (payload) => {
      if (options.ai && !generators.aiEnabled) {
        payload.logger.info(
          '[seo-autopilot] AI suggestions are off: no API key found. Rule-based text is used.',
        )
      }
      await previousOnInit?.(payload)
    }

    return config
  }
