import type { CollectionConfig, Config, Field } from 'payload'

import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'

import type { SeoAutopilotConfig } from './types.js'

import { createAltGenerator } from './core/ai.js'
import { createAltEndpoint, withAltButton } from './core/alt.js'
import { createGenerateFunctions } from './core/generate.js'
import { resolveCollectionOptions } from './core/meta.js'
import { resolveSiteUrl } from './core/site.js'

export type {
  AIAltRequest,
  AIGenerate,
  AIGenerateAlt,
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

/**
 * plugin-seo's tabbed UI puts every existing field in a "Content" tab, including fields
 * meant for the sidebar (slug, status, page type). Those only render in the sidebar at the
 * top level, so they are moved back out of the tab.
 */
export const keepSidebarFields = (collection: CollectionConfig): CollectionConfig => {
  const [first, ...rest] = collection.fields
  if (first?.type !== 'tabs' || !first.tabs[0]) {
    return collection
  }
  const [content, ...otherTabs] = first.tabs
  const isSidebar = (field: Field) =>
    'admin' in field && (field.admin as { position?: string } | undefined)?.position === 'sidebar'
  const sidebar = content.fields.filter(isSidebar)
  if (!sidebar.length || 'name' in content) {
    return collection
  }
  return {
    ...collection,
    fields: [
      {
        ...first,
        tabs: [{ ...content, fields: content.fields.filter((f) => !isSidebar(f)) }, ...otherTabs],
      },
      ...sidebar,
      ...rest,
    ],
  }
}

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

    if (options.seo !== false) {
      config = {
        ...config,
        collections: config.collections?.map((c) =>
          slugs.includes(c.slug) ? keepSidebarFields(c) : c,
        ),
      }
    }

    if (options.redirects !== false) {
      config = redirectsPlugin({
        collections: slugs,
        ...options.redirects,
      })(config)
    }

    if (options.altText !== false) {
      // The button is always registered, so the import map does not depend on whether an
      // API key happens to be set when it is generated. Without AI it renders nothing.
      const altGenerator = createAltGenerator(options.ai)
      const altCollection = options.altText?.collection ?? options.uploadsCollection ?? 'media'
      const altField = options.altText?.field ?? 'alt'

      config = {
        ...config,
        collections: config.collections?.map((collection) =>
          collection.slug === altCollection
            ? withAltButton(collection, altField, Boolean(altGenerator))
            : collection,
        ),
        endpoints: [...(config.endpoints ?? []), createAltEndpoint(altGenerator, options)],
      }
    }

    const previousOnInit = config.onInit
    config.onInit = async (payload) => {
      if (options.ai && !generators.aiEnabled) {
        payload.logger.info(
          '[seo-autopilot] AI suggestions are off: no API key found. Rule-based text is used.',
        )
      }
      if (process.env.NODE_ENV === 'production' && !resolveSiteUrl(options.siteUrl)) {
        payload.logger.warn(
          '[seo-autopilot] No site URL: set `siteUrl` or NEXT_PUBLIC_SERVER_URL. Canonical URLs ' +
            'and the sitemap are relative until then.',
        )
      }
      await previousOnInit?.(payload)
    }

    return config
  }
